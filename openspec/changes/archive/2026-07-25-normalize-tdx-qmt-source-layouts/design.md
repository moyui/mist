## Context

Theme A 已确认 TDX 与 QMT 都通过正式 builtin bridge 进入 backend，但两条实现来自不同演进路径：backend 的 QMT 文件多带 provider 前缀而 TDX 混用通用名，datasource 的 TDX/QMT provider 与 realtime 文件分散在 flat package、route 和 builtin bridge 目录中，QMT 生产 bridge 与 runtime probe 仍使用旧的 bridge/spike 身份。现有 wire frame、fencing、sequence、mode switch 与 allowlist 已经具备生产契约，本次只整理代码边界与身份。

约束包括：QMT bridge 必须保持 Python 3.6 兼容；TDX/QMT 的 provider-native 数据不在 datasource 对齐；生产 bridge 替换仍是 Windows 手工操作；不得触碰 migration、生产数据库、实时持久化或 Theme B2 回测。

## Goals / Non-Goals

**Goals:**

- 让 `mist` 与 `mist-datasource` 中相同职责的 TDX/QMT 文件在各自 provider 目录内采用相同通用名。
- 把 native-to-canonical 转换固定在 backend source 边界，共享 ingress 只接受 canonical snapshot。
- 让 production bridge、runtime probe、runtime、contract 与 route 的身份从路径即可辨认。
- 用结构守卫测试阻止旧路径和 stale experimental/spike 命名回流。
- 保持所有外部 API、WS frame、运行模式与运行行为兼容。

**Non-Goals:**

- 不要求两个 provider 拥有相同能力，不创建虚假的 QMT raw/formula 或 TDX command gateway。
- 不修改 snapshot 持久化、Redis key、分钟 K 线、通知 contextSnapshot 或数据库 migration。
- 不执行生产部署、bridge 覆盖或 Windows HIL；这些仍由后续 release gate 完成。
- 不修改历史 archive/evidence 的原始内容。

## Decisions

### 1. 目录内使用通用文件名，类名保留 provider 身份

`sources/tdx` 与 `sources/qmt` 内的同职责文件统一为 `source.service.ts`、`realtime/realtime.client.ts`、`realtime/realtime.module.ts`、`realtime/realtime.store.ts`、`realtime/realtime.types.ts` 等。类名仍使用 `Tdx*`/`Qmt*`，日志与 metrics 仍携带 source。这比全局唯一长文件名更容易逐目录对照，也不会丢失运行时身份。

datasource 同样把 provider 实现归入 `src/datasource/<source>/provider.py`，realtime 分为 `runtime.py` 与 `contract.py`，routes 使用 `bridge.py`、`realtime.py`、`v1/dependencies.py`、`v1/product.py`。provider-only 能力作为明确例外保留。

### 2. backend source adapter 负责 canonical 转换

TDX/QMT realtime client 解码 native frame 后调用本 source 的 `realtime-native.adapter.ts`，再把 `CanonicalRealtimeSnapshot` 交给共享 `RealtimeSnapshotIngressService`。共享 ingress 不再检查 `frame.source`，避免 datasource 或共享层强行统一 provider-native object。

### 3. 生产 bridge 与 probe 分离

QMT 生产文件命名为 `qmt/builtin_bridge/mist_qmt_realtime_bridge.py`，与 TDX 的 `mist_tdx_realtime_bridge.py` 对称。探测脚本移至 `tools/qmt_runtime_probe/mist_qmt_runtime_probe.py`，相关输出环境变量改为 tooling-only 的 `MIST_QMT_RUNTIME_PROBE_OUTPUT_PATH`。旧路径不提供兼容 shim，避免 Windows 操作员覆盖错误文件。

### 4. 结构守卫验证职责对称，而非文件数量相等

测试将验证两侧共有职责路径、禁止路径与 bridge/probe 身份，并维护 provider-specific allowlist。这样能捕获历史命名回流，同时允许 TDX raw/formula、QMT command gateway 等真实差异。

### 5. 外部契约保持不变

HTTP/WS URL、frame 字段、sequence/fencing、mode switch、allowlist、health payload 与 metrics 名称均不因目录整理变化。路由可以合并到同名模块，但 mount path 不变。

## Risks / Trade-offs

- [大量 import path 变更造成漏改] → 使用 `rg` 禁止旧路径，并运行两个仓库完整 unit/contract/typecheck/build。
- [QMT Python 3.6 语法回退] → 对重命名后的正式 bridge 与 probe 继续运行专用 AST/guardrail 测试。
- [route 合并意外改变 endpoint] → 用现有 route contract 测试验证 URL、loopback guard 与 payload。
- [手工 bridge 替换遗漏] → 当前文档明确 TDX/QMT 都需覆盖；旧文件名不保留，后续 HIL 以新文件 SHA 为准。
- [机械对称掩盖能力差异] → 结构守卫使用 provider-specific allowlist，不生成无实现文件。

## Migration Plan

1. 在同一 feature branch 完成 backend source 边界与文件重命名，先通过 backend tests/typecheck。
2. 完成 datasource package/routes/app factory 与 bridge/probe 重命名，通过 Python tests 与 image build。
3. 更新当前维护文档、CI path filter 和部署脚本引用，执行 `openspec validate --strict`。
4. 合并时先发布 datasource 代码/bridge artifacts，再发布 backend；因 wire contract 不变可分仓滚动发布。
5. Windows 验收前手工覆盖 TDX 与 QMT bridge，记录文件 SHA、mode、owner、subscription 和 protected-table digest。

回滚时整体回退两个仓库对应提交，并在 Windows 分别恢复上一版 TDX/QMT bridge 文件；无需数据库回滚。QMT/TDX 可通过各自 `*_REALTIME_MODE=off` 独立止血。

## Open Questions

- 无。本 change 完成后仍需执行 `align-realtime-native-ingress-contracts` 中已定义的 Windows HIL 与 release tasks。
