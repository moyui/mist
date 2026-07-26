## 1. OpenSpec 与边界

- [x] 1.1 建立 focused change，记录 provider 对称结构、允许例外、外部契约不变与 Windows bridge 手工替换边界
- [x] 1.2 将本 change 记录为 `align-realtime-native-ingress-contracts` 剩余 HIL/release tasks 的前置条件

## 2. Backend source 结构

- [x] 2.1 将 TDX/QMT source service 与 realtime 共有职责文件改为目录内通用名并更新全部 import
- [x] 2.2 为 TDX/QMT 建立 source-specific native adapter，并让共享 ingress 仅接收 `CanonicalRealtimeSnapshot`
- [x] 2.3 对齐 realtime store、diagnostic guard 与 controller 结构，同时保留各 source 的 fencing/owner 语义
- [x] 2.4 增加 backend 布局守卫和 adapter/ingress contract 测试

## 3. Datasource provider 结构

- [x] 3.1 将 TDX/QMT provider 移入各自 package，并拆分 provider-local realtime `runtime.py`/`contract.py`
- [x] 3.2 对齐 TDX/QMT route、v1 dependency 与 application factory 结构，保持所有 HTTP/WS path 不变
- [x] 3.3 清理旧 flat import、experimental gateway alias 与不再使用的 production spike settings
- [x] 3.4 增加 datasource 布局守卫与 route/provider contract 测试

## 4. Bridge、probe 与文档

- [x] 4.1 将 QMT production bridge 改为 `mist_qmt_realtime_bridge.py` 并更新 build/test/deploy 引用
- [x] 4.2 将 QMT runtime probe 移至 tooling 目录，更新 probe 身份与 `MIST_QMT_RUNTIME_PROBE_OUTPUT_PATH`
- [x] 4.3 更新当前维护中的简体中文架构、部署和验证文档，明确 TDX/QMT 都需手工覆盖 bridge
- [x] 4.4 确认历史 archive/evidence 未被回写，且当前文档不再把正式链路称为 experimental/spike

## 5. 验证与交接

- [x] 5.1 运行 backend lint、typecheck、unit/contract tests 与 build
- [x] 5.2 运行 datasource lint/typecheck、unit/contract tests 与 Python 3.6 guardrails，并确认 host-side WinSW datasource 仓库不提供 Dockerfile
- [x] 5.3 运行两个仓库旧路径扫描、布局守卫与 OpenSpec strict validation
- [x] 5.4 记录本地验证结果、发布/回滚顺序及尚未执行的 Windows HIL gate
- [x] 5.5 在可访问 registry 的环境完成 Mist Docker image build（GitHub Actions `29928049235` 以 Node.js 24 构建并推送 `mist@1fdc78a` linux/amd64 image）
