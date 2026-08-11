---
name: otel-observability-assets
version: 0.1.0
---

# OTel Observability Assets

## ADDED Requirements

### Requirement: R1: 凭据不落默认值
OTLP 认证凭据 SHALL NOT 以可解明文（含 base64）作为 compose/`.env.example` 默认值；
凭据 SHALL 经 `.env` 必需项显式管理，部署脚本链 SHALL 覆盖其设置。

#### Scenario: 部署必须显式提供凭据
- Given 部署脚本初始化环境
- When 未显式提供 OO_OTLP_AUTH_BASE64
- Then 部署 SHALL 失败并提示必需变量（而非静默使用内置默认）
- AND 仓库默认值中 SHALL NOT 存在可逆解的生产凭据

#### Scenario: OTLP 导出仍可达
- Given 显式提供凭据完成部署
- When 检查 OO 遥测
- Then traces/metrics 导出 SHALL 仍为 200（凭据显式传入后链路不回归）
