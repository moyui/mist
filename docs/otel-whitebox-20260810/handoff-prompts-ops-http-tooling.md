# 交接提示词 — 运维能力 HTTP 化/工具化（生产诊断告别 workflow 体操）

> 来源：2026-08-11 主线程（TDX 四层故障排查全程暴露：Windows 盒子无 SSH，一切运维
> 只能靠 deploy 仓 workflow 触发脚本——当天新写 4 个诊断 workflow 才完成排查）。
> **本线程职责：先与用户讨论方案方向（A/B/C/D 见下）→ 按三步工作流创建 spec → 实施。**
> 先读：`mist/docs/project-quality-governance-guide.md`（§10 验证清单、变更门禁）、
> `mist-monitoring/docs/metrics-overview.md`、本会话记忆索引（~/.zcode/cli/memories/.../MEMORY.md）。

---

## 一、背景与动机（2026-08-11 实战暴露）

TDX 行情四层故障修复当天，为了定位/修复，**临时新增了 4 个 deploy workflow**：

| workflow | 用途 | 本质痛点 |
|---|---|---|
| `dump-windows-datasource-logs` | docker logs 容器（观测帧/reject） | **datasource Python 日志不进 OO**，只能 docker logs |
| `inspect-windows-port` | netstat 查端口占用（9004=XtItClient） | 每轮触发 + 等 self-hosted runner |
| `update-windows-tdx-bridge-script` | 复制桥脚本到终端 + SHA 校验 | 终端脚本更新必须 workflow |
| `set-tdx-allowlist-stress` | 改 .env allowlist + 重启 backend | 设 allowlist 无 HTTP API；**5 只上限**；schema 422 坑 |

**根因链**：
1. **Windows 盒子无 SSH** → 一切运维操作只能 workflow 触发 PowerShell（30s-2min/轮）
2. **诊断控制器被 shrink 删除**：`apps/mist/src/` 里 `/internal/realtime/*/status` 等端点
   被 `shrink-monitoring-to-blackbox-probe` 移除（代码注释遗留 `whitebox rebuild TODO`；
   deploy 脚本 `Assert-RealtimeBusinessAllowlistStatus` 中 readback 段被禁用）
3. **datasource Python 日志未接 OTel logs exporter**（O2a 只做了 spans+metrics）——
   观测帧/bridge reject 只能 `docker logs` 挖
4. **loopback 限制**：`_require_loopback`（datasource bridge.py 多处）——health/observability
   端点只接受 Windows 宿主回环——macOS 无法直接查
5. **workflow_dispatch 输入 schema 缓存 422**（已知坑，见记忆
   `deploy-env-input-schema-cache`）——Set 系列 workflow 每次部署后必踩

## 二、用户拍板的方向（08-11）

> "deploy 里面的部署脚本太多了，也太不好用了。我们现在解决问题的工具只能靠 deploy action，
> 但是完全可以用 http 接口或者工具的方案来做。"

**目标**：把"靠 workflow 触发脚本"的运维模式，改为 **HTTP 接口 + 本地工具**。

## 三、方案框架（A/B/C/D，待与用户逐项讨论定稿）

- **A. 重建诊断 HTTP 端点**（backend + datasource）——恢复 shrink 删的 `/internal/*` 并扩展：
  - 状态类：订阅/allowlist/桥 health/Redis sealed 概览
  - 控制类：lifecycle/mode 切换（替代 Set workflow 422 坑）、allowlist 管理
  - 数据类：Redis candle 查询（替代 read-candle workflow）、观测帧实时
- **B. datasource Python 日志进 OO**（logs exporter——O2b 范畴，change 未创建）——
  观测帧/reject 直接在 OO 查，告别 docker logs
- **C. 网关放行内网管理路径**——web-gateway 代理 `/internal/*`（guard 172.16/12 + token），
  macOS 直接 curl；或放宽 `_require_loopback` 为可信网段
- **D. 本地工具**——macOS 小 CLI（curl OO + 网关 API），日常操作一条命令

**优先级建议**：B（最快见效）→ A（诊断端点）→ C（网关）→ D（CLI）。
**注意**：`permit-monitoring-to-read-realtime-source-status` change（guard 放宽 172.16/12）
8 任务未勾，可作为 A/C 的输入或独立推进。

## 四、现状锚点（2026-08-11 收盘状态）

- mist master `30d34fa`；datasource master `ab45ff6`；deploy master `e7fd3d7`
- 生产：productization=shadow、lifecycle=on（部署后补设）、strategy=on；TDX 全链路恢复
  （market_snapshot + TCP identity 修复）；QMT 待恢复（宿主 9004 被 XtItClient 占用，
  桥改 9014，终端需 setx QMT_TCP_PORT=9014 + 重启）
- 关键文件：
  - `apps/mist/src/realtime/realtime-security-allowlist.service.ts`（allowlist 解析；
    lifecycle=on 从 DB assignments，off 从 env——**on 与非空 env allowlist 冲突校验**）
  - `apps/mist/src/realtime-subscriptions/realtime-subscription.service.ts`（订阅控制）
  - datasource `src/datasource/tdx/realtime/gateway.py`（health() 已有丰富状态——
    desired/converged/lastSnapshotAt/controlTotals——但 loopback 限制）
  - datasource `src/datasource/realtime_tcp.py`（TCP 协议层，观测帧/register）
  - deploy `scripts/set-realtime-business-allowlist.ps1`（allowlist 设置——5 只上限 +
    readback disabled TODO）
  - deploy `.github/workflows/dump-windows-datasource-logs.yml` / `inspect-windows-port.yml`
    / `update-windows-tdx-bridge-script.yml` / `set-tdx-allowlist-stress.yml`（今天的临时工具，
    可作需求来源或改造）
- 已知坑：workflow 输入 schema 缓存 422（部署不传 choice，部署后 string workflow 补设）；
  OO 查询（logs 字段是 body 非 msg；spans 的 service_name；微秒窗口；type=traces/logs/metrics）

## 五、流程要求（三步工作流，每步断开等用户确认）

1. **先讨论方案**：把 A/B/C/D 逐项与用户对齐（范围、端点清单、权限模型、长期维护成本），
   讨论清楚再写 spec。**不得直接写 spec**。
2. **创建 spec**：OpenSpec change（proposal/design/tasks/specs 四件套 + `openspec validate`），
   写完停下逐条确认（确认门禁）。
3. **实施计划**：代码级（改动文件/函数签名/测试/验证命令），确认后落地。
4. **落地**：worktree 分支 + 单测 + 验证 + 合并（参考仓库惯例：mist 用 pnpm +
   `--legacy-peer-deps`；datasource 用 uv + ruff；deploy 用 pwsh-preview + test-*.ps1）。

## 六、验收目标（用户视角）

- 常见运维操作（看观测帧/查端口/设 allowlist/查 sealed/切 lifecycle）不再需要写 workflow
- macOS 上一条命令/一个 curl 完成
- 生产环境不引入新的外部依赖（延续 OTel+OpenObserve 一体化方向）
