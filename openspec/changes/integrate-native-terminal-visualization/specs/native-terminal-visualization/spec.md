# Spec: 通用绘图指令协议与原厂交易终端可视化规范

## 1. 领域引擎纯粹性与三层解耦规范 (3-Layer Architecture)

### 1.1 业务领域层零绘图污染
- **SHALL** 保持 `libs/chancore`、`libs/indicators`、`apps/backtest` 100% 专注于数学计算、状态机演进与回测撮合。
- **SHALL NOT** 在任何业务领域算法库中混入颜色、图元类型或终端绘图 API 依赖。

### 1.2 通用绘图指令层独立性
- **SHALL** 由独立的 `libs/visual-command` 模块负责将领域模型转换为标准绘图原语（`line`, `band`, `text`, `icon`）。
- **SHALL** 支持通过 `layers` 参数自由组合图层（如 `chan`, `indicator`, `backtest`）。

---

## 2. 通用绘图指令协议规范 (Visual Command Protocol)

### 2.1 统一绘图指令接口
- **GIVEN** 客户端 Bridge 请求标的的绘图指令
- **WHEN** 调用 `GET /v1/visual/commands` 传入 `code`, `period`, `source`, `layers`
- **THEN** 响应必须包含平铺的通用指令对象数组（`commands: VisualCommand[]`）。
- **AND** 单次全量转换与序列化耗时不得超过 `50ms`。

### 2.2 原语完整性
- **SHALL** 支持以下 4 种核心几何原语：
  1. `line`：包含 `startIndex`, `endIndex`, `startPrice`, `endPrice`, `color`, `width`, `style`；
  2. `band`：包含 `fromIndex`, `toIndex`, `top`, `bottom`, `color`, `fill`；
  3. `text`：包含 `index`, `price`, `text`, `color`, `position`；
  4. `icon`：包含 `index`, `price`, `shape`, `color`。

---

## 3. 终端极简哑执行器规范 (Dumb Render Bridges)

### 3.1 客户端零业务逻辑
- **SHALL NOT** 在 QMT Python 脚本或 TDX DLL 中执行任何缠论数学计算或指令生成。
- **SHALL** 仅做通用指令类型到终端绘图 API 的直接映射：
  - QMT：`line` ➔ `paint(draw_type=0)`, `band` ➔ `paint(draw_type=0/4)`, `text` ➔ `paint(draw_type=3)`；
  - TDX：`line` ➔ `DRAWLINE`, `band` ➔ `STICKLINE`, `text` ➔ `DRAWTEXT`。

---

## 4. 部署拓扑与交易时段安全规范 (Deployment & Safety)

### 4.1 彻底移除 Nginx 网关
- **SHALL** 从 Docker Compose 中移除 `mist-web-gateway` 容器。
- **SHALL** 直接通过宿主机 `8001` 端口提供后端与绘图指令服务，`3000` 端口提供测试前端。

### 4.2 交易时段安全守则
- **SHALL NOT** 在交易时段（上海时间 09:15 ~ 15:05）执行任何代码部署与容器变更。
- **SHALL** 全部落地与验证在 15:05 收盘后启动。
