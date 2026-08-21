# 实施计划 — remediate-otel-audit-findings（G2 凭据集中一处 + 轮换）

> 2026-08-11。spec 已确认（G1/G3/G4/G5 核对 done；G2 拍板 A+C：git 零凭据默认、.env 单一来源
> 明文密码、脚本派生 base64、定时轮换）。本 change 实际只实施 G2（mist-deploy 仓）。

## 0. 前置事实（已核实）

- `Set-DockerEnvValue`（`scripts/common/deploy-common.ps1:39`）：覆盖式写 .env（幂等更新，
  已有键覆盖、缺失追加）
- 部署脚本 `deploy-docker-appliance.ps1` 在 `Initialize-DockerApplianceRoot` 段写 .env
  （MIST_IMAGE_TAG 等，L541-602 模式）
- workflow 有 secret 先例：`GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}`（L147）
- 当前生产 OO：root@mist.local / <REDACTED>；生产 .env **无** OO_ROOT_USER_PASSWORD /
  OO_OTLP_AUTH_BASE64（全靠 compose 默认值）——收敛后首次部署必须显式提供密码
- validate 步骤跑 `test-deploy-docker-appliance.ps1`（dry-run）——需核对 dry-run 是否写
  .env/需要凭据（落地时验证）

## 1. 分支与工作流

- 分支 `feat/remediate-otel-audit`，基于 master（当前 `65a1053`）
- worktree `.worktrees/remediate-otel-audit`（mist-deploy 仓）
- 3 个逻辑 commit：① openspec delta（G2 定稿）→ ② deploy 仓代码（compose/env/脚本/门禁/文档）
  → ③ tasks 勾选
- ff 合并 master + push

## 2. 文件改动清单（mist-deploy 仓，改 5 + 新 1）

**A. `docker/compose.yaml`**
- 4 处（L94/124/157/209）：
  `"Authorization=Basic ${OO_OTLP_AUTH_BASE64:-cm9vdEBtaXN0...}"` →
  `"Authorization=Basic ${OO_OTLP_AUTH_BASE64:?set OO_OTLP_AUTH_BASE64}"`（必需项，无默认）
- openobserve 服务（L~355）：`ZO_ROOT_USER_PASSWORD: ${OO_ROOT_USER_PASSWORD:-Mist@2026!Observe}`
  → `${OO_ROOT_USER_PASSWORD:?set OO_ROOT_USER_PASSWORD}`
- `ZO_ROOT_USER_EMAIL` 保留默认（用户名非敏感）

**B. `docker/.env.example`**
- `OO_OTLP_AUTH_BASE64=cm9vdEBtaXN0...` 行删除 → 注释说明：
  `# OO_OTLP_AUTH_BASE64 由部署脚本从 OO_ROOT_USER_EMAIL:OO_ROOT_USER_PASSWORD 派生，勿手填`
- 补 `OO_ROOT_USER_PASSWORD=` 占位（空值 + 注释"生产凭据，勿提交"）

**C. `scripts/deploy-docker-appliance.ps1`**（Initialize-DockerApplianceRoot 的 env 写入段）
- 前置校验：`$env:OO_ROOT_USER_PASSWORD` 为空 → `throw "OO_ROOT_USER_PASSWORD is required (GitHub secret)"`
- 派生：`$ooAuthB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${OO_ROOT_USER_EMAIL}:${OO_ROOT_USER_PASSWORD}"))`
  （`OO_ROOT_USER_EMAIL` 从 workflow env 或默认 root@mist.local）
- `Set-DockerEnvValue -Path $envPath -Name "OO_ROOT_USER_PASSWORD" -Value $env:OO_ROOT_USER_PASSWORD`
- `Set-DockerEnvValue -Path $envPath -Name "OO_OTLP_AUTH_BASE64" -Value $ooAuthB64`
- **注意**：dry-run（validate）路径需核对——若 dry-run 触发该段，validate job 也要传 secret
  （或 dry-run 跳过凭据写入——落地时按 test-deploy-docker-appliance.ps1 的实际调用核对）

**D. `.github/workflows/deploy-windows-mist-stack.yml`**
- deploy 步骤（调用 deploy-docker-appliance.ps1 的 step）加 env：
  ```yaml
  env:
    OO_ROOT_USER_PASSWORD: ${{ secrets.OO_ROOT_USER_PASSWORD }}
    OO_ROOT_USER_EMAIL: root@mist.local
  ```
- validate 步骤：按 C 的 dry-run 核对结果决定是否同样注入

**E. `scripts/test-docker-compose-config.ps1`**
- 加 2 条 Assert-Contains：`${OO_OTLP_AUTH_BASE64:?` 与 `${OO_ROOT_USER_PASSWORD:?`（必需项形态）

**F. 新 `docs/credentials-rotation.md`**（轮换流程）
- 改 OO 管理员密码（OO UI/API）→ 更新 GitHub secret `OO_ROOT_USER_PASSWORD` → 重新部署
  （脚本重算 base64 写 .env）→ 重启 openobserve + 各服务 → 验证 OTLP traces/metrics/logs 200
- 注明：历史凭据作废（git 历史中的旧 base64 无效）

## 3. 测试/验证

- `docker compose config`：本地无 env 时**预期报错**（必需项）——用 `OO_OTLP_AUTH_BASE64=dummy
  OO_ROOT_USER_PASSWORD=dummy docker compose config` 验证语法合法
- `pwsh-preview scripts/test-docker-compose-config.ps1`（CI 门禁，含新断言）
- validate job 的 dry-run 测试（test-deploy-docker-appliance.ps1）——核对凭据写入路径
- 部署验证（下次部署）：**先设 GitHub secret**（`gh secret set OO_ROOT_USER_PASSWORD`——
  值=当前生产密码或轮换后新密码）→ 部署 → 生产 OO 确认 OTLP 200 + 凭据显式生效
- 轮换验证：文档流程走一遍（可选，用户按需）

## 4. 收尾

- tasks 2.1-2.6 勾选 → 归档（--skip-specs）
- 部署验证留待下次部署（或本轮部署随 gaps 后的首次部署）

## 5. 风险与注意

- **不改**：openobserve 数据卷（密码轮换不迁移数据）；OTLP headers 的其余部分
- 收敛后**未设 secret 的部署会失败**（必需项 throw）——**预期行为**（防凭据缺失静默）
- 生产 .env 首次写入：部署脚本派生写（O0 以来的默认凭据值会进 .env——**后续轮换覆盖**）
- dry-run 行为（validate）落地时实测；若 dry-run 写 .env 则 validate job 注入 secret
