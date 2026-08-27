# Design: 通用绘图指令协议与原厂交易终端可视化架构设计

## 1. 架构总览（三层解耦 + 统一网关）

系统采用 **“领域层（Domain） ➔ 绘图指令层（Visual Commands） ➔ 哑执行器层（Dumb Bridges）”** 架构，并由 Nginx 网关提供统一 80 端口入口。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 业务领域层（Pure Domain & Math Engines）                                 │
│    - libs/chancore (缠论分型/宽笔/特征序列段/中枢v4全量交集/买卖点)           │
│    - libs/indicators (MACD/KDJ/EMA均线带/布林通道)                           │
│    - apps/backtest (回测交易明细/止损止盈位/持仓网格)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 纯业务领域数据 (Domain Entities)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. 通用绘图指令生成层 (Universal Visual Command Engine: libs/visual-command) │
│    - 纯内存工具库，将领域数据翻译为【通用绘图原语 (Drawing Commands)】        │
│    - 提供 HTTP API: GET /v1/visual/commands                                  │
│    - 支持图层组合: layers=chan,indicator,backtest                           │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
       统一绘图指令流 │ (JSON: line, band, text, icon)      │ 统一绘图指令流
                    ▼                                     ▼
┌────────────────────────────────────────┐ ┌──────────────────────────────────┐
│ 3. QMT 极简 Bridge (Dumb Executor)     │ │ 4. TDX 极简 Bridge (Dumb Executor)│
│    - 零业务逻辑、零指令生成            │ │    - 零业务逻辑、零指令生成      │
│    - 只做“指令映射到 QMT paint()”      │ │    - 只做“指令映射到 TDX 绘图函数”│
│      - line  ➔ ContextInfo.paint(0)    │ │      - line  ➔ DRAWLINE          │
│      - band  ➔ ContextInfo.paint(4)    │ │      - band  ➔ STICKLINE         │
│      - text  ➔ ContextInfo.paint(3)    │ │      - text  ➔ DRAWTEXT          │
└────────────────────────────────────────┘ └──────────────────────────────────┘

                       ▲                                     ▲
                       │                                     │
┌──────────────────────┴─────────────────────────────────────┴────────────────┐
│ 5. Nginx 统一 Web 网关 (Port 80)                                             │
│    - /          ➔ mist-fe (纯后台管理系统: 策略配置/订阅分配/告警确认/盘前巡检)│
│    - /api/mist/ ➔ mist-backend:8001                                         │
│    - /api/chan/ ➔ chan-api:8008                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 通用绘图指令协议规范 (Visual Command Schema)

后端提供统一接口：`GET /v1/visual/commands`
- **请求参数**：
  - `code`：标的代码（如 `000001`）
  - `period`：周期（如 `5`）
  - `source`：数据源（`qmt` 或 `tdx`）
  - `layers`：请求图层（如 `chan,backtest,indicators`，默认 `chan`）
  - `count`：K 线根数（默认 `500` 根）

- **标准指令原语结构（Canonical Visual Commands）**：
  ```json
  {
    "code": "000001",
    "period": 5,
    "source": "qmt",
    "commands": [
      {
        "type": "line",
        "id": "chan_bi_10_25",
        "layer": "chan",
        "startIndex": 10,
        "endIndex": 25,
        "startPrice": 3800.5,
        "endPrice": 3880.0,
        "color": "yellow",
        "width": 1,
        "style": "solid"
      },
      {
        "type": "band",
        "id": "chan_zs_15_60",
        "layer": "chan",
        "fromIndex": 15,
        "toIndex": 60,
        "top": 3870.0,
        "bottom": 3830.0,
        "color": "cyan",
        "fill": true
      },
      {
        "type": "text",
        "id": "chan_bsp_85",
        "layer": "chan",
        "index": 85,
        "price": 3950.0,
        "text": "1卖",
        "color": "green",
        "position": "above"
      },
      {
        "type": "icon",
        "id": "backtest_buy_40",
        "layer": "backtest",
        "index": 40,
        "price": 3820.0,
        "shape": "arrow_up",
        "color": "red"
      }
    ]
  }
  ```

---

## 3. QMT 哑执行器主图指标设计（第一阶段重点）

QMT 内部加载的 Python 主图指标 `MistVisualBridge.py` 极其纯粹，没有任何业务计算：

```python
# coding: gbk
# MistVisualBridge.py - QMT 通用绘图指令极简执行器 (< 30 行)
import urllib.request
import json

def handlebar(ContextInfo):
    if not ContextInfo.is_last_bar():
        return
    stock = ContextInfo.stockcode
    period = ContextInfo.period
    url = f"http://127.0.0.1:8001/v1/visual/commands?code={stock}&period={period}&source=qmt&layers=chan,backtest"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            data = json.loads(resp.read().decode('utf-8')).get("data", {})
            for cmd in data.get("commands", []):
                cmd_type = cmd.get("type")
                cmd_id = cmd.get("id")
                color = cmd.get("color", "yellow")
                
                # 1. 映射折线 (笔、线段、通道)
                if cmd_type == "line":
                    ContextInfo.paint(f"{cmd_id}_S", cmd["startPrice"], draw_type=0, color=color)
                # 2. 映射区间带 (中枢、网格、布林带)
                elif cmd_type == "band":
                    ContextInfo.paint(f"{cmd_id}_TOP", cmd["top"], draw_type=0, color=color)
                    ContextInfo.paint(f"{cmd_id}_BOT", cmd["bottom"], draw_type=0, color=color)
                # 3. 映射文本与标记 (买卖点、信号标签)
                elif cmd_type == "text":
                    ContextInfo.paint(cmd_id, cmd["price"], draw_type=3, text=cmd["text"], color=color)
    except Exception:
        pass
```

---

## 4. TDX（通达信）哑执行器设计（第二阶段）

通达信端目标运行环境锁定为 **通达信金融终端 V7.73（64 位 / x64）**，结构完全统一：
- 通达信加载标准 64 位瘦 DLL 插件（`mist_visual_tdx.dll`，存放于 `T0002/dlls/` 目录）；
- DLL 同样向 `GET /v1/visual/commands?source=tdx` 获取同一份指令 JSON；
- DLL 按照 `type` 将数据填充至通达信数组中；
- 通达信公式执行：
  - `DRAWLINE` 渲染 `type == "line"`；
  - `STICKLINE` 渲染 `type == "band"`；
  - `DRAWTEXT` 渲染 `type == "text"`。

---

## 5. Web 管理后台与 Nginx 网关拓扑

1. **`mist-fe` 纯后台管理系统定位**：
   - 专注提供：策略定义与版本切换、实时行情订阅 ACTIVE 分配控制台、微信/告警事件确认、回测任务管理与历史流水、09:05 盘前巡检体检卡片；
   - 界面无复杂重型图表负担，加载速度极快、响应轻盈。
2. **Nginx（`web-gateway`）统一反向代理**：
   - 监听宿主机 `80` 端口，单域访问无跨域（CORS）问题；
   - 局域网电脑直接通过浏览器打开 `http://192.168.31.182` 即可管理全系统。
