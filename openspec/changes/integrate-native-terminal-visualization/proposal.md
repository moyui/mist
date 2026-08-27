# Proposal: 通用绘图指令协议与原厂交易终端（QMT & TDX）原生可视化架构

## 背景与痛点

在量化交易、缠论形态分析与策略回测中，K 线图表的缩放流畅度、图元吸附、键盘快捷键换股以及多周期无级切换等交互手感至关重要。
我们在前期探索中，基于 Web 前端（ECharts）构建了回测与 K 线可视化界面。然而在实际使用中暴露出通用 Web 统计图表的天然短板：
1. **交互手感与专业交易终端存在差距**：ECharts 在多图层密集图元（合并K、笔、线段、笔中枢、段中枢、买卖点 Pin）下，坐标映射吸附、十字光标对齐以及长周期滚动缩放的性能与流畅度不及 C++ 原生桌面终端；
2. **绘图逻辑与业务算法深度耦合**：如果将绘图指令生成直接绑定在 `apps/chan` 中，未来新增技术指标（如布林通道、MACD背离线）、策略回测标记（买入均价线、动态止损止盈带、网格交易区间）时将导致接口臃肿、多端重复造轮子。

与此同时，用户日常深度使用的两款核心看盘与交易终端——**通达信（TDX）** 与 **迅投（QMT）**，本身即具备顶级的 C++ 硬件加速渲染能力、经典的看盘快捷键生态与丰富的绘图扩展机制。

---

## 核心设计决策（Architectural Invariants）

1. **三层解耦架构（Domain ➔ Visual Command Protocol ➔ Dumb Render Bridge）**：
   - **领域业务层（Pure Domain & Math）**：`libs/chancore`、`libs/indicators`、`apps/backtest` 保持 100% 纯粹算法与业务逻辑，零绘图污染；
   - **通用绘图指令生成层（Universal Visual Engine: `libs/visual-command`）**：独立模块，负责将任意领域对象（缠论几何、指标通道、回测信号）统一转换为标准【绘图原语指令集（Drawing Commands: `line`, `band`, `text`, `icon`）】；
   - **终端极简执行层（Dumb Render Bridge）**：QMT 与 TDX 客户端中的 Bridge 仅作为**纯执行器（Dumb Executor）**，零业务逻辑、零指令生成，仅负责将标准指令映射为原生绘图 API（QMT `paint()` / TDX `DRAWLINE` 等）。

2. **终端结构 100% 统一与未来零成本扩展**：
   - QMT 与 TDX 接收完全一致的通用绘图指令协议；
   - 未来后台新增任何指标或策略可视化图层，**QMT 与 TDX 客户端 Bridge 代码无需修改一行**，终身免维护。

3. **前端定位转型为纯后台管理系统与 Nginx 保留**：
   - **`mist-fe` 转型为纯管理后台（Admin Console）**：聚焦于策略配置、实时订阅生命周期管理、告警事件确认、回测历史任务调度、盘前巡检体检等核心运维管理功能，不再自研重型金融桌面图表；
   - **Nginx（Web Gateway）保留作为统一 80 端口入口**：对外提供标准单域反向代理（`/` ➔ 前端管理后台，`/api/mist/` ➔ 后端，`/api/chan/` ➔ 缠论服务），免除跨域 CORS 困扰，统一管理访问。

4. **交易时段安全守则（Market-Hour Safety Invariant）**：
   - 所有涉及后端接口新增、容器重构与 QMT 脚本更新的实操操作，**必须严格在收盘后（15:05+）执行**，坚决保障日内交易时段行情入库与实时评估的稳定性。

---

## 影响范围

- **后端 (`mist`)**：在 `libs/visual-command` 与 `apps/mist/src/visual` 中提供通用绘图指令生成器与 `GET /v1/visual/commands` 接口。
- **QMT 终端集成 (`mist-datasource`)**：编写极简 QMT Python 哑执行器主图指标脚本（`< 30` 行），做指令映射与 `ContextInfo.paint()` 渲染。
- **TDX 终端集成 (`mist-datasource`)**：编写标准 TDX 64 位瘦 DLL 哑执行器与主图公式，做通用指令映射与绘制。
- **前端 (`mist-fe`)**：作为纯后台管理系统运行，由 Nginx 统一反向代理。
