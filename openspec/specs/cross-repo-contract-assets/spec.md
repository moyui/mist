# cross-repo-contract-assets Specification

## Purpose
规定跨仓 realtime golden fixture 的存放位置、canonical/pinned copy 关系、
SHA-256 一致性验证与稳定维护文档归属，使各仓能够独立执行契约测试。

## Requirements
### Requirement: Realtime golden fixture 使用测试资产目录
系统 SHALL 将 realtime golden fixture 存放在各仓语义明确的测试 fixture 目录中，并且 SHALL NOT 要求顶层 `contracts/` 目录承载该测试资产。

#### Scenario: 四仓使用各自 fixture 路径
- **WHEN** backend、datasource、deploy 或 monitoring contract test 读取 realtime golden fixture
- **THEN** 测试从该仓的 `test`、`tests` 或 `scripts/fixtures` 目录读取文件
- **AND** 仓库顶层不存在用于该 fixture 的 `contracts/` 目录

### Requirement: 跨仓 fixture 保持 pinned SHA 一致
`mist` SHALL 维护 canonical realtime golden fixture，consumer 仓 SHALL 保存可独立测试的 pinned copy，并通过标准 `.sha256` sidecar 校验内容。

#### Scenario: 独立仓库验证 fixture
- **WHEN** 任一 consumer 仓在没有其他 Mist 仓库 checkout 且不访问网络的环境运行 contract test
- **THEN** 测试能够读取本地 fixture 和 `.sha256` sidecar
- **AND** 计算得到的 SHA 与 sidecar 一致

#### Scenario: 跨仓一致性验收
- **WHEN** 执行跨仓 fixture 验收
- **THEN** 四仓当前版本的 canonical realtime golden fixture 字节和 SHA 完全一致
- **AND** 四份 `.sha256` sidecar 固定同一个 SHA

### Requirement: Monitoring 稳定接口文档归入 docs
Monitoring 的 metrics、alerts、actions 稳定接口说明 SHALL 存放在 `mist-monitoring/docs/`，现行测试和维护文档 SHALL 引用新位置。

#### Scenario: Monitoring package structure 验证
- **WHEN** monitoring package structure 与 metrics documentation tests 运行
- **THEN** 测试在 `docs/` 下找到 metrics、alerts、actions 文档
- **AND** metrics 实现仍由同一份稳定文档覆盖

### Requirement: 历史 archive 保持不变
迁移 SHALL NOT 重写已归档 OpenSpec change 中的历史 fixture、证据或路径引用。

#### Scenario: 清理当前路径引用
- **WHEN** 清点 archive 之外的 `contracts/` 路径引用
- **THEN** 所有当前测试、active OpenSpec 和维护文档均指向新位置
- **AND** archive 中的历史内容保持原样

### Requirement: 迁移不改变运行时契约
路径迁移 SHALL 保持 realtime fixture 内容和运行时配置不变，且 SHALL NOT 改变 WS frame、transport、sequence、fencing 或 datasource mode。

#### Scenario: 迁移后的 contract regression
- **WHEN** 四仓相关 contract 与 runtime configuration tests 完成
- **THEN** golden fixture 的原始 SHA 保持不变
- **AND** realtime 运行时行为没有因文件迁移而改变
