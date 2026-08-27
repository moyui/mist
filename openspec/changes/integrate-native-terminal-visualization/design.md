# Design: 原厂交易终端原生可视化与极简架构设计

## 1. 架构总览与资产复用

系统采用 **“Headless Core（统一核心大脑） + UI Projection（多端原生投影）”** 架构，深度复用现有 `libs/chancore` 算法与 `mist-datasource` 的 QMT Bridge 运行环境。

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Mist Core Backend & Storage             │
                  │                                                        │
                  │  1. libs/chancore (100% 复用已有算法库，算法唯一权威)     │
                  │     - 包含关系 / 宽笔 / 特征序列段 / 中枢延伸全量交集 v4   │
                  │     - 1/2/3 类趋势背驰与回抽买卖点                       │
                  │  2. apps/backtest (100% 复用已有统一回测运行时)         │
                  │     - 历史 K 线流式回放、信号撮合、策略评估              │
                  │  3. apps/mist/src/chan (新增极速一站式几何投影接口)      │
                  │     - GET /v1/chan/projection: 毫秒级打包笔/段/中枢/买卖点│
                  └──────────────┬──────────────────────────┬──────────────┘
                                 │                          │
                 HTTP REST 直连  │              HTTP REST 直连│ (Thin DLL)
                 (:8001/v1/chan) │              (:8001/v1/chan)
                                 ▼                          ▼
                  ┌────────────────────────┐  ┌────────────────────────┐
                  │   迅投 (QMT 主图指标)   │  │   通达信 (TDX 瘦DLL)   │
                  │      【第一阶段重点】   │  │       【第二阶段】     │
                  │                        │  │                        │
                  │  - 深度复用已建 Bridge │  │  - 瘦 DLL 网络桥接    │
                  │    ContextInfo 原生环境│  │  - TDX 主图公式        │
                  │  - ContextInfo.paint() │  │  - DRAWLINE / STICKLINE│
                  │  - 换股自动刷新        │  │  - 小键盘极速换股      │
                  │  - 原生 C++ 硬件加速   │  │  - 毫秒级重绘          │
                  │  - 十字光标/量价精准吸附│  │                        │
                  └────────────────────────┘  └────────────────────────┘
```

---

## 2. 核心模块与端到端交互设计

### 2.1 后端极速一站式几何投影 API (`/v1/chan/projection`)
由于现有接口（`/v1/chan/bi`、`/v1/chan/channel`、`/v1/chan/duan`）各自独立返回，为了让终端在换股瞬间以一次网络 I/O 获取全套图元，在 `apps/mist/src/chan/chan.controller.ts` 中新增聚合端点：
- **请求方法**：`GET /v1/chan/projection`（或 `POST /v1/chan/projection`）
- **请求参数**：
  - `code`：标的代码（如 `000001`、`880003`、`600519`）
  - `period`：周期（如 `5`, `30`, `1440`）
  - `source`：数据源（`qmt` 或 `tdx`）
  - `startDate` / `endDate`：时间范围（可选，默认最近 N 根 K 线）
  - `count`：K 线根数（默认 500 根）
- **内部实现原理**：
  1. 调用 `IndicatorService.findKData` 拿到 K 线数组；
  2. 连续调用 `ChanCore.mergeK` ➔ `ChanCore.createBi` ➔ `ChanCore.createDuan` ➔ `ChanCore.createChannel` ➔ `ChanCore.detectBuySellPoints`；
  3. 将各层级几何数据平铺打包为扁平的 `ChanProjectionVo`；
  4. 单次全量计算响应耗时 `< 50ms`。
- **返回数据结构（Canonical Projection Schema）**：
  ```json
  {
    "code": "000001",
    "period": 5,
    "bi": [
      { "startIndex": 10, "endIndex": 25, "startPrice": 3800.5, "endPrice": 3880.0, "direction": "up" }
    ],
    "duan": [
      { "startIndex": 10, "endIndex": 85, "startPrice": 3800.5, "endPrice": 3950.0, "direction": "up" }
    ],
    "zhongshu": [
      {
        "startIndex": 15,
        "endIndex": 60,
        "zg": 3870.0,
        "zd": 3830.0,
        "gg": 3900.0,
        "dd": 3810.0,
        "level": "bi"
      }
    ],
    "signals": [
      { "index": 85, "time": "2026-08-26 14:45:00", "price": 3950.0, "type": "first_sell", "label": "1卖" }
    ]
  }
  ```

---

### 2.2 QMT（迅投）主图指标与已建 Bridge 复用设计（阶段一）

我们在 `mist-datasource/qmt/builtin_bridge/mist_qmt_realtime_bridge.py` 已经打通了在 Windows 宿主机 QMT 进程内的 Python 运行环境。
在 QMT 客户端中接入主图绘图指标极度轻量：
1. **指标注册**：在 QMT “主图指标管理” 中新建 Python 主图指标 `MistChan.py`；
2. **事件驱动**：在 `handlebar(ContextInfo)` 函数中：
   ```python
   # coding: gbk
   # MistChan QMT 主图缠论指标
   import urllib.request
   import json

   def handlebar(ContextInfo):
       if not ContextInfo.is_last_bar():
           return
       stock = ContextInfo.stockcode
       period = ContextInfo.period
       url = f"http://127.0.0.1:8001/v1/chan/projection?code={stock}&period={period}&source=qmt"
       try:
           req = urllib.request.Request(url)
           with urllib.request.urlopen(req, timeout=1.0) as resp:
               payload = json.loads(resp.read().decode('utf-8'))
               data = payload.get("data", {})
               
               # 1. 绘制笔折线
               for bi in data.get("bi", []):
                   ContextInfo.paint(f"BI_{bi['startIndex']}", bi['startPrice'], draw_type=0, color='yellow')
               
               # 2. 绘制中枢区间 (ZG/ZD)
               for zs in data.get("zhongshu", []):
                   ContextInfo.paint(f"ZG_{zs['startIndex']}", zs['zg'], draw_type=0, color='cyan')
                   ContextInfo.paint(f"ZD_{zs['startIndex']}", zs['zd'], draw_type=0, color='cyan')
               
               # 3. 绘制买卖点标签
               for sig in data.get("signals", []):
                   is_sell = "卖" in sig["label"]
                   ContextInfo.paint(f"SIG_{sig['index']}", sig["price"], draw_type=3, text=sig["label"], color='green' if is_sell else 'red')
       except Exception as e:
           pass
   ```
3. **交互效果**：
   - 只要在 QMT K 线界面切换股票（如 `000001`）或切换周期（5m、30m），QMT 自动拉取 Mist 计算结果并在主图上以硬件加速重绘；
   - 支持 QMT 自带的鼠标滚轮无级缩放与十字光标精准吸附。

---

### 2.3 通达信（TDX）瘦 DLL 插件与公式设计（阶段二）

1. **瘦 DLL 桥接机制**：
   - 使用开源 `PluginTCalcFunc` 接口编译出轻量级 `mist_chan_tdx.dll`（放在 `T0002/dlls/` 目录下）；
   - DLL 内部**不维护重复的缠论算法**，仅作为一个极速 HTTP / Socket 客户端向 `http://127.0.0.1:8001/v1/chan/projection` 获取数据；
   - 提取笔端点、中枢边界和买卖点数组并返回给通达信公式系统。
2. **通达信主图公式**：
   - 通达信公式调用 `TDXDLL1`，并使用通达信原生绘图指令渲染：
     - `DRAWLINE` 绘制笔折线和线段；
     - `STICKLINE` 绘制中枢矩形方块；
     - `DRAWTEXT` 在 K 线高低点标注买卖点。

---

### 2.4 回测架构唯一真理与复盘联动

- **回测引擎唯一性**：回测计算 100% 走 Mist 自己的统一回测引擎（`apps/backtest`），杜绝 TDX/QMT 自带回测口径不一的问题；
- **复盘工作流**：
  1. 用户在 Mist 提交回测任务，获取回测交易信号明细（包含精确触发时间戳、价格、标的）；
  2. 用户在 QMT 或 TDX 终端输入该标的代码，按时间定位到对应 K 线，即可在原生专业图表上复盘该买卖点的几何形态与背驰力度。

---

### 2.5 部署拓扑精简（移除 Nginx 网关容器）

1. **移除 `web-gateway` 容器**：
   - 从 `mist-deploy/docker/compose.yaml` 中彻底移除 `mist-web-gateway`（Nginx）服务定义；
2. **服务端口直接暴露**：
   - `mist-backend` / API：暴露在宿主机端口 `8001`；
   - `mist-fe`（测试看板）：暴露在宿主机端口 `3000`；
   - `openobserve`：暴露在宿主机端口 `5080`；
3. **优势**：
   - 彻底避免 Nginx 502/端口占用/路由代理错位的问题；
   - 本地 QMT / TDX 脚本直接访问 `http://127.0.0.1:8001`，性能最高、延迟最低。
