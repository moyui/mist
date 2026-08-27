# Spec: 原厂交易终端原生可视化与回测职责隔离规范

## 1. 统一算法与回测核心唯一性规范 (Unified Core Authority)

### 1.1 缠论算法唯一权威
- **SHALL** 由 `libs/chancore` 作为全系统缠论算法的唯一计算源，包含：
  - 严格顶底分型与包含关系合并；
  - 宽笔标准（`isWideBi`）；
  - 特征序列线段划分；
  - 中枢延伸全量公共交集（`v4`：$ZG = \max(\text{lows})$, $ZD = \min(\text{highs})$）；
  - 1/2/3 类趋势背驰与中枢回抽买卖点。
- **SHALL NOT** 使用通达信公式内部计算或 QMT 内置指标作为缠论算法的判定基准。

### 1.2 回测执行与撮合唯一性
- **SHALL** 保持 `apps/backtest` 作为策略回测与信号回放的唯一执行引擎。
- **SHALL NOT** 依赖通达信“程序化交易评测”或 QMT 内置策略回测模块产出的撮合与绩效指标。

---

## 2. 原厂终端图表投影规范 (Terminal UI Projection)

### 2.1 极速几何投影接口
- **GIVEN** 通达信 DLL 或 QMT Python 脚本请求缠论几何数据
- **WHEN** 调用 `GET /v1/chan/projection` 传入标的代码、周期及时间范围
- **THEN** 响应必须包含平铺的笔数组、线段数组、中枢区间（ZG/ZD/GG/DD）及买卖点标签。
- **AND** 单次几何计算与序列序列化耗时不得超过 `50ms`。

### 2.2 QMT 原生绘图集成规范（第一阶段）
- **GIVEN** QMT 客户端加载 `MistChan.py` 主图自定义指标
- **WHEN** 用户在 QMT 中切换股票或周期触发 `handlebar(ContextInfo)` 时
- **THEN** 脚本必须向本地 Mist 服务（`http://127.0.0.1:8001/api/chan/projection`）拉取几何数据。
- **AND** 必须调用 `ContextInfo.paint()` 接口以 C++ 硬件加速方式在主图绘制笔、中枢及买卖点。
- **AND** 图表必须保留 QMT 自带的鼠标滚轮无级缩放、平移与十字光标吸附能力。

### 2.3 TDX（通达信）瘦 DLL 插件与公式集成规范（第二阶段）
- **GIVEN** 通达信客户端主图挂载缠论指标公式
- **WHEN** 通达信主图刷新并调用 `TDXDLL1`
- **THEN** 瘦 DLL 插件必须向 Mist 后端（`http://127.0.0.1:8001/v1/chan/projection`）提取该股票对应周期的结构端点。
- **AND** 通达信主图公式必须使用 `DRAWLINE` 绘制笔/线段，使用 `STICKLINE` 绘制中枢区间，使用 `DRAWTEXT` 绘制买卖点标签。
- **AND** 键盘输入股票代码或切换周期（如 F5）时，主图必须自动重绘最新缠论结构。

---

## 3. 前端与网关精简规范 (Lean Frontend & Gateway Removal)

### 3.1 前端职责收敛
- **SHALL** 将 `mist-fe` 定位为研发测试、策略管理、实时订阅状态配置与接口健康检查看板。
- **SHALL NOT** 在 Web 端强制要求自研高复杂度桌面级金融图表。

### 3.2 彻底移除 Nginx 网关容器
- **SHALL** 从 Docker Compose 部署栈中移除 `mist-web-gateway` 容器。
- **SHALL** 直接将后端服务映射至宿主机 `8001` 端口，测试前端映射至 `3000` 端口。
