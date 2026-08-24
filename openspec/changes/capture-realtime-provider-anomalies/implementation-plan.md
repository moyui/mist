# Implementation Plan: capture-realtime-provider-anomalies

> 本计划对应 `mist` 仓 active change `capture-realtime-provider-anomalies`（0/14，唯一剩余实现任务）。
> 落地仓库主体：**mist-deploy**（仅读采集/脱敏/workflow/runbook）；mist 仓只动本 change 目录。
> 三步工作流第 2 步产物：spec（四件套）已确认有效，本计划为代码级落地细节，确认后进入第 3 步。

## 0. 复用资产（不重写）

| 现有资产 | 用途 |
|----------|------|
| `scripts/collect-docker-appliance-diagnostics.ps1` | 共同采集入口的时间戳目录 + `Invoke-DiagnosticsCommand` 模式（`param` + `common\deploy-defaults.ps1` dot-source + `$ErrorActionPreference = "Stop"`） |
| `scripts/write-qmt-unsubscribe-evidence.ps1` | QMT unsubscribe journal/health 证据的既有实现，扩展为 §2.3 而非重写 |
| `scripts/common/deploy-defaults.ps1` | `Resolve-MistDeployDefault` 默认值解析（新脚本一律走它，不硬编码路径） |
| `.github/workflows/recover-windows-tdx-runtime.yml` / `recover-windows-qmt-runtime.yml` | §3.1 pre/post-recovery bundle 的挂载点（workflow 步骤内调用采集脚本，不改 recovery 逻辑） |
| `.github/workflows/test-deploy-scripts.yml` | CI 门禁矩阵，新 `test-*.ps1` 全部加入 |
| `docs/runbooks/*.md` | 新 runbook `provider-incident-capture.md` 放同一目录 |
| `oo-alerts/rules.json` | §3.3：已有 A1/A2/… 11 条规则；只加注释/引用链接，**不改规则语义** |

**红线（spec 强制）**：所有脚本只读——不执行 subscription mutation、不断网、不替换进程、不调用 provider SDK；不得包含 fault plan / chaos switch / journal corruption / network block / subscription mutation 关键字；任何脚本不得 import/调用终端 SDK。

---

## §1 Evidence contract（tasks 1.1 / 1.2 / 1.3）

### 1.1 `scripts/common/incident-bundle.schema.json`（新）
bounded incident JSON schema，顶层字段固定：

```jsonc
{
  "schemaVersion": 1,
  "incidentId": "string",            // 操作员提供，如 INC-2026-0001
  "source": "tdx|qmt",               // 枚举
  "observationWindow": { "start": "ISO8601", "end": "ISO8601" },
  "trigger": "string",               // monitoring|health|bounded-log|operator
  "captureStart": "ISO8601",
  "artifacts": [ { "name": "string", "sha256": "string", "sizeBytes": "number" } ],
  "readiness": {                    // 采集时刻快照
    "containerImage": "string", "bridgeBuild": "string", "ownerGeneration": "string",
    "datasourceHealth": "string", "backendConnection": "string"
  },
  "providerFacts": { "classifier": "string", "boundedDetails": "object" },
  "conclusion": "observed|not-observed|unknown",
  "recovery": { "action": "string", "finalState": "string" }
}
```
校验函数 `Test-IncidentBundleSchema`（PowerShell 读 schema + 递归字段断言）；`conclusion` 三态为顶层枚举，`providerFacts.classifier` 有界枚举（§2.2/§2.3 分类表）。

### 1.2 `scripts/common/incident-bundle.common.ps1`（新，dot-source 公共库）
关键函数签名：

```powershell
function New-IncidentBundleDirectory {
    param(
        [Parameter(Mandatory)][string]$IncidentId,
        [Parameter(Mandatory)][ValidateSet("tdx","qmt")][string]$Source,
        [Parameter(Mandatory)][datetime]$WindowStart,
        [Parameter(Mandatory)][datetime]$WindowEnd
    )
    # -> 返回 "$env:TEMP\mist-incident\<IncidentId>\<Source>\pre"（或既有 evidence root，见 deploy-defaults 扩展）
}
function Protect-IncidentValue {
    param([Parameter(Mandatory)][object]$Value, [Parameter(Mandatory)][string]$FieldName, [hashtable]$Allowlist)
    # 命中 deny 字段（lease token / native snapshot / 业务表 / 绝对路径 / unbounded log）→ 替换为 bounded summary 或 "[REDACTED:<class>]"
}
function Add-BundleArtifact {
    param([Parameter(Mandatory)][string]$BundleDir, [Parameter(Mandatory)][string]$SourcePath)
    # 拷贝 + 计算 SHA-256，登记进 bundle manifest JSON（artifacts 数组）
}
function Set-IncidentConclusion {
    param([ValidateSet("observed","not-observed","unknown")][string]$Conclusion)
    # 写 bundle 顶层 conclusion；defense-in-depth：任何权威 postcondition 缺失时强制 unknown
}
```

allowlist/deny 清单（**字段级别**）：
- deny：`leaseToken`、`nativeSnapshot`、`journalRaw`、`callbackPayload`、`businessRow`、`absolutePath`、`freeFormDump`
- allow：`source`、`bridgeBuild`、`artifactSha256`、`symbolDigest`（非完整 symbol 列表）、`classifier`、`window`、`readiness`、`operatorAction`

### 1.3 测试 `scripts/test-incident-bundle-contract.ps1`（新）
- fixture：`scripts/fixtures/incident/tdx-snapshot-delivery-failure.json`、`tdx-unsubscribe-verify-failed.json`、`qmt-unsubscribe-raises.json`、`qmt-durability-failure.json` **synthetic 样例**（文件头注释强制 `# deterministic fixture — NOT live terminal evidence`）
- 断言：
  a) serializer 将每个 fixture 转 bundle JSON，schema 校验通过
  b) 对含 deny 字段的 fixture 输入，输出值被替换为 `[REDACTED:<class>]`，bundle 内 SHA-256 全为 64 位 hex
  c) `conclusion` 只接受三态；无 postcondition 输入 → 强制 `unknown`
  d) fixture 元数据/输出路径不得出现 "live"/"production terminal" 字样

---

## §2 只读采集器（tasks 2.1 / 2.2 / 2.3 / 2.4）

### 2.1 `scripts/capture-provider-incident.ps1`（新，共同只读入口）
```powershell
param(
    [Parameter(Mandatory)][string]$IncidentId,
    [Parameter(Mandatory)][ValidateSet("tdx","qmt")][string]$Source,
    [Parameter(Mandatory)][string]$WindowStart,   # ISO8601
    [Parameter(Mandatory)][string]$WindowEnd,
    [ValidateSet("pre","post")][string]$Phase = "pre",
    [string]$OutputRoot = ""                      # Resolve-MistDeployDefault 兜底
)
```
职责（全部只读，复用 `deploy-common.ps1` 的 docker 封装）：
1. `New-IncidentBundleDirectory` 建目录
2. 采集 `docker inspect`（容器 image/SHA/创建时间）+ `docker compose ps`（running 状态）→ `readiness.json`
3. datasource root 下 bounded health（`Invoke-RestMethod` 到 `http://127.0.0.1:9001/tdx/bridge/health` 或 `9002/health`，`-TimeoutSec 5`，失败即记录 `unknown` 不抛）
4. bounded logs：容器日志 `--tail N`（N 走 defaults `DiagnosticsTail` 默认值）+ datasource state 下最近日志文件摘要
5. 分派 `Invoke-TdxIncidentFacts` / `Invoke-QmtIncidentFacts`（见 2.2/2.3）
6. `Add-BundleArtifact` 全部产物 + `Test-IncidentBundleSchema` + 输出 bundle 路径

### 2.2 `scripts/capture-tdx-incident-facts.ps1`（新，被 2.1 dot-source 调用）
```powershell
function Invoke-TdxIncidentFacts {
    param([Parameter(Mandatory)][string]$BundleDir, [datetime]$WindowStart, [datetime]$WindowEnd)
}
```
分类器（`classifier` 有界枚举）：
| classifier | 触发证据 | 必须记录的 bounded facts |
|---|---|---|
| `TDX_SNAPSHOT_DELIVERY_FAILURE` | bridge log 的 snapshot POST 网络失败/不可用响应 | bridge build/SHA、symbol digest、观察时间、bounded failure class、尝试次数摘要（缺失 → `unknown`，不得发明 retry counter） |
| `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed` | fresh current-owner native list 仍含目标 | bounded native-call outcome + fresh-list 观察 |
| `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown` | native list probe 失败/超时/fenced/不可 normalize | probe 失败分类；recovery 不得声称物理退订完成 |
| `TDX_QUANTITY_CONTRACT_DEVIATION` | 缺字段/类型/grammar/scale/range/counter/profile 漂移 | source、field、bounded reason、artifact identity、window（不保存完整 raw snapshot） |

### 2.3 `scripts/capture-qmt-incident-facts.ps1`（新；扩展现有 `write-qmt-unsubscribe-evidence.ps1` 的 journal 读取逻辑）
```powershell
function Invoke-QmtIncidentFacts {
    param([Parameter(Mandatory)][string]$BundleDir, [datetime]$WindowStart, [datetime]$WindowEnd)
}
```
分类器（有界枚举）：`QMT_UNSUBSCRIBE_UNCONFIRMED`、`QMT_DURABILITY_FAILURE`、`QMT_OWNER_FENCE`、`QMT_CALLBACK_ANOMALY`、`QMT_QUANTITY_CONTRACT_DEVIATION`。
- `QMT_UNSUBSCRIBE_UNCONFIRMED`：`unsubscribe_quote` 自然 raise/非法返回值 → 记录 exact bounded type/value 或 exception class + 保留 registry bucket；物理订阅状态强制 `unknown`
- `QMT_DURABILITY_FAILURE`：journal health 类别 + `reconciliationRequired` + retained-recovery aggregate + last durable sequence/hash 摘要；**不得为补证据重复 native mutation**
- `QMT_OWNER_FENCE` / `QMT_CALLBACK_ANOMALY`：owner/build identity + bounded 本地诊断；不暴露 lease token / 完整 callback 数据

### 2.4 测试 `scripts/test-provider-incident-capture.ps1`（新）
- 断言：
  a) synthetic 模式下（无 HTTP endpoint 可达、无 docker），`capture-provider-incident.ps1` 全流程输出 bundle，`conclusion` = `not-observed`，且**不抛错**（降级观察）
  b) 源码静态扫描：`capture-provider-incident.ps1` + `capture-*-incident-facts.ps1` + `incident-bundle.common.ps1` 中 grep 不得命中 `fault`、`chaos`、`corrupt`、`block`、`Inject`、`subscription mutation` 关键字（白名单注释除外）
  c) 两个 facts 脚本内不得出现 `xtquant` / `tqcenter` / `threading.Thread`（既有 guardrail：datasource 容器无终端 SDK）

---

## §3 运维 workflow 与 runbook（tasks 3.1 / 3.2 / 3.3 / 3.4）

### 3.1 `docs/runbooks/provider-incident-capture.md`（新，简体中文）
章节：① 触发判定（monitoring 告警 / health / bounded log / operator 观察——对应 `oo-alerts/rules.json` 的 A1/A2/… 现有规则）② pre-recovery bundle 采集命令（逐字可复制：`capture-provider-incident.ps1 -IncidentId ... -Source tdx -Phase pre`）③ 既有 source-scoped recovery（`recover-windows-tdx-runtime.yml` / `recover-windows-qmt-runtime.yml` 的 workflow_dispatch 参数表）④ post-recovery bundle 采集 ⑤ 结论写入规则（`observed|not-observed|unknown`，无权威 postcondition → `unknown`）⑥ 上报/归档路径（bundle 目录 + GitHub 手工 workflow 引用）。

### 3.2 `.github/workflows/capture-windows-provider-incident.yml`（新，手工 workflow）
```yaml
on:
  workflow_dispatch:
    inputs:
      incident_id:    # 必填，如 INC-2026-0001
      source:         # choice: tdx | qmt
      window_start:   # ISO8601
      window_end:     # ISO8601
      phase:          # choice: pre | post，default pre
      output_branch:  # 默认 main；workflow 只上传 bundle 作为 artifact（不自动建 PR、不自动触发 recovery）
```
- 步骤：checkout → 跑 `capture-provider-incident.ps1` → `actions/upload-artifact` bundle
- 显式约束：**不**调用 recover workflow、**不**自动触发异常、无 cron

### 3.3 runbook/告警链接
- `oo-alerts/rules.json` 顶层 `_comment` 追加一句：`"provider incident capture: see docs/runbooks/provider-incident-capture.md"`（不改任何 rule 语义）
- `docs/runbooks/operations-recovery.md` 增加一行交叉链接到新 runbook

### 3.4 测试 `scripts/test-provider-incident-isolation.ps1`（新）
- 断言：
  a) TDX facts 脚本（含其调用的 recovery 相关路径）不触碰 `state/qmt/` 任何文件；QMT facts 脚本不触碰 `tdx-guard`/TDX state（静态路径断言 + synthetic 运行后目录指纹对比）
  b) 输入为 `unknown` 边界（postcondition 不可读）时结论保持 `unknown`，不因 heartbeat/另一订阅进展升级为 `success`

---

## §4 发布与 review（tasks 4.1 / 4.2 / 4.3）—— env-blocked

| task | 内容 | 阻塞 |
|---|---|---|
| 4.1 | 当前 realtime release manifest（部署 workflow 说明区）标 `not-observed` 并引用本 change，负分支不再是 normal-path release blocker | 无（随 §1-3 落地时一并写） |
| 4.2 | 全仓验证：`test-deploy-scripts.yml`（加入全部新 test-*.ps1）+ `git diff --check` + mist 仓 `openspec validate` | 无 |
| 4.3 | 首个真实 incident 后 operator 按 runbook 第⑤⑥章 review bundle：区分 fact/unknown/inference；若推翻当前 contract → 另建 reviewed OpenSpec delta，不在本 change 静默改语义 | **env-blocked：等首个真实 incident** |

---

## 文件改动总清单（mist-deploy 仓）

| 文件 | 动作 |
|------|------|
| `scripts/common/incident-bundle.schema.json` | 新增 |
| `scripts/common/incident-bundle.common.ps1` | 新增 |
| `scripts/capture-provider-incident.ps1` | 新增 |
| `scripts/capture-tdx-incident-facts.ps1` | 新增 |
| `scripts/capture-qmt-incident-facts.ps1` | 新增（复用 `write-qmt-unsubscribe-evidence.ps1` 的 journal 读取） |
| `scripts/fixtures/incident/*.json` | 新增 ×4（deterministic 标注） |
| `scripts/test-incident-bundle-contract.ps1` | 新增 |
| `scripts/test-provider-incident-capture.ps1` | 新增 |
| `scripts/test-provider-incident-isolation.ps1` | 新增 |
| `.github/workflows/capture-windows-provider-incident.yml` | 新增 |
| `.github/workflows/test-deploy-scripts.yml` | 修改：矩阵加 3 个新测试脚本 |
| `docs/runbooks/provider-incident-capture.md` | 新增（简体中文） |
| `docs/runbooks/operations-recovery.md` | 修改：交叉链接 |
| `oo-alerts/rules.json` | 修改：`_comment` 加引用（只读语义不动） |
| `mist/openspec/changes/capture-realtime-provider-anomalies/tasks.md` | 修改：§1-3 逐项勾选 + 证据；§4 保持未勾 |

## 验证命令

```bash
# mist-deploy 本地（macOS 上跑 PowerShell 语法校验 + 测试脚本静态检查）
pwsh-preview -NoProfile -File scripts/test-incident-bundle-contract.ps1 -Mode Static
# CI 门禁（推送后）
# test-deploy-scripts.yml matrix 覆盖 test-incident-bundle-contract / test-provider-incident-capture / test-provider-incident-isolation
git diff --check
# mist 仓 OpenSpec 校验（未归档前）
openspec validate capture-realtime-provider-anomalies
```

> 注意：`test-provider-incident-capture.ps1` 与 `test-provider-incident-isolation.ps1` 设计为 **synthetic/deterministic 模式**（无 docker、无 HTTP、无真实终端），可在 CI 全绿；真实采集只允许经手工 workflow 在 Windows 机器触发。