# Proposal: 原厂交易终端（TDX & QMT）原生图表可视化与极简架构解耦

## 背景与痛点

在量化交易与缠论技术分析中，K 线图表的缩放流畅度、图元对齐吸附、键盘快捷键换股、多周期无级切换等交互手感至关重要。
我们在前期探索中，基于 Web 前端（ECharts）构建了回测与 K 线可视化界面。然而在实际使用中暴露出通用 Web 统计图表的天然短板：
1. **交互手感与专业交易终端存在差距**：ECharts 在多图层密集图元（合并K、笔、线段、笔中枢、段中枢、买卖点 Pin）下，坐标映射吸附、十字光标对齐以及长周期滚动缩放的性能与流畅度不及 C++ 原生桌面终端；
2. **多端割裂与维护负担**：重复在 Web 端造“金融桌面图表”的轮子性价比低，且增加了前端与网关（Nginx SPA 代理）的运维复杂度。

与此同时，用户日常深度使用的两款核心看盘与交易终端——**通达信（TDX）** 与 **迅投（QMT）**，本身即具备顶级的 C++ 硬件加速渲染能力、经典的看盘快捷键生态与丰富的绘图扩展机制。

---

## 核心设计决策（Architectural Invariants）

1. **核心大脑唯一真理与零重复造轮子（Unified Chancore Authority & Bridge Reuse）**：
   - 缠论核心算法（`libs/chancore`，包含包含关系处理、宽笔、线段、中枢延伸全量公共交集 v4、1/2/3 类趋势背驰与回抽买卖点）以及回测运行系统（`apps/backtest`），**100% 复用已有算法库，零重复开发，统一计算与执行**；
   - 深度复用 `mist-datasource` 已建好的 **QMT Builtin Bridge** 运行环境（`mist_qmt_realtime_bridge.py`），直接利用其持有的 `ContextInfo` 原生对象调用 `ContextInfo.paint()` 接口进行极速主图绘制；
   - 坚决**不依赖** TDX 或 QMT 自带的传统回测系统，避免因撮合机制、滑点逻辑与数据格式不一致导致回测口径割裂。

2. **一站式几何投影接口（One-Stop Fast Projection API）**：
   - 后端仅需在 `apps/mist/src/chan` 增补一个极薄的聚合接口 `GET /v1/chan/projection`，将笔、段、中枢区间（ZG/ZD/GG/DD）与买卖点标签一次性打包输出（延迟 `< 50ms`），避免终端分次请求。

3. **终端角色定位：纯粹的 UI 渲染器（Headless Core + UI Projection）**：
   - **QMT 终端（第一优先级）**：采用 **QMT「主图自定义指标」模式**，复用已建 bridge 环境与原生 Python，调用 `ContextInfo.paint()`，在换股和切换周期时自动在 QMT 原生主图上渲染中枢、笔与买卖点；
   - **TDX 终端（第二阶段）**：采用 **瘦 DLL 桥接模式**，DLL 仅作为轻量网络桥接，向 Mist 聚合接口拉取计算好的缠论端点数据，通过主图公式（`DRAWLINE`、`STICKLINE`、`DRAWTEXT`）投影到通达信主图；
   - **数据源闭环原则**：从 TDX 采集的数据可在 TDX 原厂回显，从 QMT 采集的数据可在 QMT 原厂回显。

4. **前端与网关层瘦身（Lean Frontend & Gateway Removal）**：
   - `mist-fe` 重新定位于**轻量级研发测试、状态看板与接口诊断工具**，不再承担高复杂度的沉重桌面图表自研负担；
   - **彻底移除 Nginx 网关容器**，各服务（`8001` 后端/API、`3000` 测试前端、`5080` 监控等）直接通过宿主机端口独立访问，极大简化 Docker Compose 部署栈。

5. **交易时段安全守则（Market-Hour Safety Invariant）**：
   - 所有涉及后端接口新增、容器重构与 QMT 脚本更新的实操操作，**必须严格在收盘后（15:00+）执行**，坚决保障日内交易时段行情入库与实时评估的稳定性。

---

## 影响范围

- **后端 (`mist`)**：在 `apps/mist/src/chan` 中提供 `GET /v1/chan/projection` 极速几何聚合接口。
- **QMT 终端集成 (`mist-datasource`)**：复用 `mist_qmt_realtime_bridge.py` 宿主环境，提供标准 QMT Python 主图指标，调用 `ContextInfo.paint()` 实时绘制。
- **TDX 终端集成 (`mist-datasource`)**：集成开源通达信瘦 DLL 插件与配套公式，实现 `TDXDLL` 驱动的毫秒级绘制。
- **部署与网关 (`mist-deploy`)**：从 Compose 栈中移除 `mist-web-gateway`（Nginx）容器，直接映射各服务端口（`8001`、`3000`）。
