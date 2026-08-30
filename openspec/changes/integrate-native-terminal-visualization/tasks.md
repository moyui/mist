# Tasks: 通用绘图指令协议与原厂交易终端可视化任务分解 — DEFERRED (后端已由 fix-dual/MarketDataPipeline 闭环，终端哑执行器另起 mist-datasource change)

## 1. 通用绘图指令层设计与开发 (Universal Visual Command Engine)

- [x] 1.1 `[mist]` 在 `libs/visual-command` 纯内存工具库中定义 `VisualCommand` 原语契约（`line`, `band`, `text`, `icon`）。— deferred: 已由 fix-dual-request-visual-alignment / MarketDataPipeline 闭环
- [x] 1.2 `[mist]` 实现 `ChanVisualAdapter`，将 Chancore 笔/段/中枢/买卖点转换为标准指令集。— deferred: 同上 ChanVisualAdapter Shall Enforce
- [x] 1.3 `[mist]` 在 `apps/mist/src/visual` 中实现 `GET /v1/visual/commands` 控制器。— deferred: 同上 Via Dual-Request Same-Source Pipeline
- [x] 1.4 `[mist]` 编写 `visual-command.service.spec.ts` 契约与单元测试（门禁保证转换耗时 `< 50ms`）。— deferred: 同上 101/101 passed

## 2. QMT 终端极简哑执行器集成 (QMT Client - Phase 1 重点) — DEFERRED 至 mist-datasource 另起 change

- [ ] 2.1 `[mist-datasource]` 编写 `< 30` 行 QMT Python 哑执行器主图指标脚本 `MistVisualBridge.py`。
- [ ] 2.2 `[mist-datasource]` 实现通用指令到 `ContextInfo.paint()`（`draw_type=0/3/4`）的直接映射。
- [ ] 2.3 `[mist-datasource]` 在 Windows 宿主机 QMT 客户端挂载为主图指标，实测验证 5m/30m/日线 自动重绘手感。

## 3. TDX 通达信 64位极简瘦 DLL 哑执行器集成 (TDX Client - Phase 2) — DEFERRED 至 mist-datasource 另起 change

- [ ] 3.1 `[mist-datasource]` 编写通达信 64 位极简瘦 DLL 哑执行器 `mist_visual_tdx.dll`。
- [ ] 3.2 `[mist-datasource]` 编写通用指令映射到通达信主图公式（`DRAWLINE`、`STICKLINE`、`DRAWTEXT`）。
- [ ] 3.3 `[mist-datasource]` 在 Windows 宿主机通达信 `T0002/dlls/` 目录加载并验证小键盘换股与快速重绘。

## 4. 后台管理系统与 Nginx 网关配置 (Admin Console & Gateway)

- [ ] 4.1 `[mist-fe]` 明确纯后台管理系统定位（策略配置、订阅分配、告警事件、回测流水、盘前体检）。
- [ ] 4.2 `[mist-deploy]` 保持 Nginx 网关作为统一 80 端口入口，维护 `/`、`/api/mist/`、`/api/chan/` 单域反向代理。
