# Design: 通用绘图指令协议与原厂交易终端可视化架构设计

## 1. 架构总览（三层解耦）

系统采用 **“领域层（Domain） ➔ 绘图指令层（Visual Commands） ➔ 哑执行器层（Dumb Bridges）”** 架构。

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
│    - 独立模块，将领域数据翻译为【通用绘图原语 (Drawing Commands)】           │
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

通达信端结构完全统一：
- 通达信加载标准瘦 DLL 插件（`mist_visual_tdx.dll`）；
- DLL 同样向 `GET /v1/visual/commands?source=tdx` 获取同一份指令 JSON；
- DLL 按照 `type` 将数据填充至通达信数组中；
- 通达信公式执行：
  - `DRAWLINE` 渲染 `type == "line"`；
  - `STICKLINE` 渲染 `type == "band"`；
  - `DRAWTEXT` 渲染 `type == "text"`。

---

## 5. 部署拓扑精简（移除 Nginx 网关容器）

1. **移除 `mist-web-gateway` 容器**：从 `mist-deploy/docker/compose.yaml` 中移除 Nginx 网关；
2. **直连固定端口**：
   - `mist-backend`（API 及指令引擎）：宿主机 `8001` 端口；
   - `mist-fe`（轻量测试看板）：宿主机 `3000` 端口；
   - `openobserve`（全链路观测）：宿主机 `5080` 端口；
3. **零转发开销**：QMT 与 TDX 插件直连 `http://127.0.0.1:8001`，无中间代理，延迟 `< 50ms`。
