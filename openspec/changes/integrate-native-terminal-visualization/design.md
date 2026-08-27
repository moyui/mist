# Design: 原厂交易终端原生可视化与极简架构设计

## 1. 架构总览

系统采用 **“Headless Core（统一核心大脑） + UI Projection（多端原生投影）”** 架构。

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 Mist Core Backend & Storage             │
                  │                                                        │
                  │  1. libs/chancore (缠论算法引擎 v4 唯一权威)              │
                  │     - 包含关系 / 宽笔 / 特征序列段 / 中枢延伸全量交集      │
                  │     - 1/2/3 类趋势背驰与回抽买卖点                       │
                  │  2. apps/backtest (统一回测运行时)                      │
                  │     - 历史 K 线流式回放、信号撮合、策略评估              │
                  │  3. apps/chan (极速几何投影 API)                        │
                  │     - /v1/chan/projection: 批量导出笔/段/中枢/买卖点      │
                  └──────────────┬──────────────────────────┬──────────────┘
                                 │                          │
                    HTTP REST API│              HTTP REST API│ / DLL 插件桥接
                                 ▼                          ▼
                  ┌────────────────────────┐  ┌────────────────────────┐
                  │       迅投 (QMT)       │  │      通达信 (TDX)      │
                  │    【策略回测与看盘】   │  │       【日常看盘】     │
                  │                        │  │                        │
                  │  - Python 极简指标脚本  │  │  - 开源标准 DLL 插件   │
                  │  - ContextInfo.paint() │  │  - TDX 主图公式        │
                  │  - 原生 C++ 硬件加速   │  │  - DRAWLINE / STICKLINE│
                  │  - 十字光标/量价精准吸附│  │  - 小键盘极速换股      │
                  └────────────────────────┘  └────────────────────────┘
```

---

## 2. 核心模块与端到端交互设计

### 2.1 后端极速几何投影 API (`/v1/chan/projection`)
为了让 QMT Python 脚本和 TDX DLL 插件以毫秒级速度获取当前视窗所需的全部缠论结构，后端提供结构扁平、无需客户端计算的投影接口：
- **请求参数**：`code`, `period`, `source`, `startDate`, `endDate` (或 `count`)
- **返回数据结构**：
  ```json
  {
    "bi": [
      { "startIndex": 10, "endIndex": 25, "startPrice": 3800.5, "endPrice": 3880.0, "direction": "up" }
    ],
    "duan": [
      { "startIndex": 10, "endIndex": 85, "startPrice": 3800.5, "endPrice": 3950.0, "direction": "up" }
    ],
    "zhongshu": [
      { "startIndex": 15, "endIndex": 60, "zg": 3870.0, "zd": 3830.0, "gg": 3900.0, "dd": 3810.0, "level": "bi" }
    ],
    "signals": [
      { "index": 85, "price": 3950.0, "type": "first_sell", "label": "1卖" }
    ]
  }
  ```

---

### 2.2 QMT（迅投）原生渲染集成设计

QMT 内部运行完整 Python 解释器。集成仅需一个轻量级 Python 指标脚本（`< 50` 行）：
1. 在 QMT “主图指标” 或 “模型研究” 中添加脚本；
2. 在 `handlebar(ContextInfo)` 事件中：
   - 提取当前股票代码 `ContextInfo.stockcode`、周期 `ContextInfo.period`；
   - 调用本地 API `requests.get("http://127.0.0.1:8001/api/chan/projection", params=...)`；
   - 解析返回的几何图元，调用 QMT 原生绘图 API：
     - `ContextInfo.paint('笔', bi_price, draw_type=0, color='yellow')`（画折线）
     - `ContextInfo.paint('中枢ZG', zg_price, draw_type=0, color='blue')`
     - `ContextInfo.paint('中枢ZD', zd_price, draw_type=0, color='blue')`
     - `ContextInfo.paint('1卖', signal_price, draw_type=3, text='1S', color='green')`（画文字/标记）
3. 渲染效果：直接在 QMT 原生 K 线图上呈现，享受 QMT 原生无级缩放与平移。

---

### 2.3 通达信（TDX）开源 DLL 插件与公式集成设计

通达信端直接采用开源社区成熟的标准方案（如 `ChanlunX` / `CZSC` 插件规范）：
1. **DLL 部署**：
   - 将开源编译的 `mist_chan_tdx.dll`（标准 32位/64位 C++ 插件）复制到通达信安装目录 `T0002/dlls/` 下；
   - 在通达信“公式管理器 ➔ DLL函数”中将该 DLL 绑定为 1 号插件；
2. **通达信主图公式**：
   - 公式中调用 `TDXDLL1` 传入当前 K 线的 `HIGH`, `LOW`, `CLOSE`, `OPEN`；
   - DLL 内部通过本地 HTTP/Socket 获取 Mist 的 Chancore 计算结果，返回端点索引与价格数组；
   - 通达信公式使用原生绘图语法渲染：
     ```pascal
     { 绘制缠论笔 }
     NOTEXT_UP_BI: DRAWLINE(BI_DIR = -1, LOW, BI_DIR = 1, HIGH, 0), COLORRED, LINETHICK2;
     NOTEXT_DOWN_BI: DRAWLINE(BI_DIR = 1, HIGH, BI_DIR = -1, LOW, 0), COLORGREEN, LINETHICK2;

     { 绘制中枢方块 }
     STICKLINE(IN_ZHONGSHU, ZD, ZG, 8, 0), COLORBLUE;

     { 标注买卖点 }
     DRAWTEXT(BSP_TYPE = 1, HIGH * 1.01, '1卖'), COLORGREEN;
     DRAWTEXT(BSP_TYPE = 2, LOW * 0.99, '1买'), COLORRED;
     ```

---

### 2.4 回测架构与职责边界

```
                           ┌────────────────────────┐
                           │      用户发起回测       │
                           └───────────┬────────────┘
                                       │
                                       ▼
                     ┌────────────────────────────────────┐
                     │     Mist 统一回测引擎 (apps/backtest)│
                     │                                    │
                     │  - 严格撮合、滑点扣费、胜率与资金曲线 │
                     │  - 统一产出带有精确时间戳的买卖点信号  │
                     └─────────────────┬──────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
                    ▼                                     ▼
        ┌────────────────────────┐            ┌────────────────────────┐
        │       TDX 终端         │            │        QMT 终端        │
        │  【定位 K 线观察形态】  │            │  【定位 K 线观察形态】  │
        │                        │            │                        │
        │  根据信号时间输入代码   │            │  根据信号时间输入代码   │
        │  直接在主图复盘形态     │            │  直接在主图复盘形态     │
        └────────────────────────┘            └────────────────────────┘
```
- **核心原则**：回测计算 100% 走 Mist 自己的统一回测引擎，杜绝 TDX/QMT 自带回测口径不一的问题；
- **终端用途**：TDX 和 QMT 只作为“显微镜”，用来在原生图表上精确定位、观察那几根触发买卖点的 K 线及中枢形态。

---

### 2.5 `mist-fe` 与网关拓扑简化

1. **`mist-fe` 职责演进**：
   - 降级为研发人员的 **“测试工作台与健康状态监控看板”**；
   - 保留策略管理、实时订阅状态配置、接口连通性诊断页面；
   - 不再承担重型金融图表交互与深度自研维护。
2. **网关与网络拓扑简化**：
   - Windows API 机器上各服务端口直接暴露（如 `8001` 主后端、`8008` 缠论服务、`3000` 前端）；
   - Nginx 网关可精简为轻量级反向代理或直接通过各服务原生端口访问，极大简化运维。
