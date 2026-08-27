# Tasks: 原厂交易终端原生可视化与极简架构任务分解

## 1. 几何投影接口设计与开发 (Backend API)

- [ ] 1.1 `[mist]` 在 `apps/chan` 或 `apps/mist` 中定义 `ChanProjectionVo` 数据契约。
- [ ] 1.2 `[mist]` 实现 `GET /v1/chan/projection` 控制器，聚合笔、段、中枢与买卖点为平铺数组。
- [ ] 1.3 `[mist]` 编写 `projection.controller.spec.ts` 契约与单元测试。

## 2. QMT 终端原生绘图集成 (QMT Client)

- [ ] 2.1 `[mist-datasource]` 编写 QMT 原生 Python 绘图指标模板脚本 `mist_chan_qmt.py`。
- [ ] 2.2 `[mist-datasource]` 实现调用 Mist 本地 API 并调用 `ContextInfo.paint()` 进行折线、中枢与买卖点绘制。
- [ ] 2.3 `[mist-datasource]` 在 QMT 客户端挂载并验证 5m/30m/日线 绘图流畅度。

## 3. TDX 通达信开源插件与公式集成 (TDX Client)

- [ ] 3.1 `[mist-datasource]` 引入开源通达信 DLL 插件标准（C++/Rust）并配置本地 API 数据桥接。
- [ ] 3.2 `[mist-datasource]` 编写通达信主图缠论公式（`DRAWLINE`、`STICKLINE`、`DRAWTEXT`）。
- [ ] 3.3 `[mist-datasource]` 在 Windows 宿主机通达信 `T0002/dlls/` 目录加载并验证小键盘换股与快速重绘。

## 4. 前端与部署拓扑优化 (Frontend & Deployment)

- [ ] 4.1 `[mist-fe]` 明确前端作为测试看板定位，精简重型依赖。
- [ ] 4.2 `[mist-deploy]` 评估并精简 Nginx 网关配置，支持直连端口访问。
