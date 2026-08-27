# Tasks: 原厂交易终端原生可视化与极简架构任务分解

## 1. 几何投影接口设计与开发 (Backend API - apps/mist/src/chan)

- [ ] 1.1 `[mist]` 在 `apps/mist/src/chan` 中定义 `ChanProjectionVo` 数据契约（支持 bi, duan, zhongshu, signals 平铺导出）。
- [ ] 1.2 `[mist]` 在 `chan.controller.ts` 中实现 `GET /v1/chan/projection` 控制器，直接聚合 Chancore 缠论结构为平铺数组。
- [ ] 1.3 `[mist]` 编写 `chan.controller.spec.ts` 契约与单元测试（门禁保证单次计算延迟 `< 50ms`）。

## 2. QMT 终端原生绘图集成 (QMT Client - Phase 1 重点)

- [ ] 2.1 `[mist-datasource]` 基于已有的 `mist_qmt_realtime_bridge.py` 宿主环境，编写 QMT 原生 Python 主图指标脚本 `MistChan.py`。
- [ ] 2.2 `[mist-datasource]` 实现通过 `requests` 直连 Mist 本地 API，并调用 `ContextInfo.paint()` 进行笔折线、中枢区间与买卖点标签绘制。
- [ ] 2.3 `[mist-datasource]` 在 Windows 宿主机 QMT 客户端挂载为主图指标，实测验证 5m/30m/日线 自动重绘手感。

## 3. TDX 通达信开源插件与公式集成 (TDX Client - Phase 2)

- [ ] 3.1 `[mist-datasource]` 引入开源通达信瘦 DLL 插件（C++/Rust）并配置本地 Mist API 数据桥接。
- [ ] 3.2 `[mist-datasource]` 编写通达信主图缠论公式（`DRAWLINE`、`STICKLINE`、`DRAWTEXT`）。
- [ ] 3.3 `[mist-datasource]` 在 Windows 宿主机通达信 `T0002/dlls/` 目录加载并验证小键盘换股与快速重绘。

## 4. 部署拓扑精简与 Nginx 移除 (Deployment Simplification)

- [ ] 4.1 `[mist-fe]` 明确前端作为测试看板定位，精简重型依赖。
- [ ] 4.2 `[mist-deploy]` 从 `docker/compose.yaml` 中彻底移除 `mist-web-gateway` 容器，直接暴露 `8001` 后端、`3000` 前端端口并更新部署脚本。
