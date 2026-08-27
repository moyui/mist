# Tasks: 通用绘图指令协议与原厂交易终端可视化任务分解

## 1. 通用绘图指令层设计与开发 (Universal Visual Command Engine)

- [ ] 1.1 `[mist]` 在 `libs/visual-command` 中定义 `VisualCommand` 原语契约（`line`, `band`, `text`, `icon`）。
- [ ] 1.2 `[mist]` 实现 `ChanVisualAdapter`，将 Chancore 笔/段/中枢/买卖点转换为标准指令集。
- [ ] 1.3 `[mist]` 在 `apps/mist/src/visual` 中实现 `GET /v1/visual/commands` 控制器。
- [ ] 1.4 `[mist]` 编写 `visual-command.service.spec.ts` 契约与单元测试（门禁保证转换耗时 `< 50ms`）。

## 2. QMT 终端极简哑执行器集成 (QMT Client - Phase 1 重点)

- [ ] 2.1 `[mist-datasource]` 编写 `< 30` 行 QMT Python 哑执行器主图指标脚本 `MistVisualBridge.py`。
- [ ] 2.2 `[mist-datasource]` 实现通用指令到 `ContextInfo.paint()`（`draw_type=0/3/4`）的直接映射。
- [ ] 2.3 `[mist-datasource]` 在 Windows 宿主机 QMT 客户端挂载为主图指标，实测验证 5m/30m/日线 自动重绘手感。

## 3. TDX 通达信极简瘦 DLL 哑执行器集成 (TDX Client - Phase 2)

- [ ] 3.1 `[mist-datasource]` 编写通达信极简瘦 DLL 哑执行器 `mist_visual_tdx.dll`。
- [ ] 3.2 `[mist-datasource]` 编写通用指令映射到通达信主图公式（`DRAWLINE`、`STICKLINE`、`DRAWTEXT`）。
- [ ] 3.3 `[mist-datasource]` 在 Windows 宿主机通达信 `T0002/dlls/` 目录加载并验证小键盘换股与快速重绘。

## 4. 部署拓扑精简与 Nginx 移除 (Deployment Simplification)

- [ ] 4.1 `[mist-fe]` 明确前端作为测试看板定位，精简重型依赖。
- [ ] 4.2 `[mist-deploy]` 从 `docker/compose.yaml` 中彻底移除 `mist-web-gateway` 容器，直接暴露 `8001` 后端、`3000` 前端端口并更新部署脚本。
