---
name: otel-runtime-init
version: 0.1.0
---

# OTel Runtime Init

## ADDED Requirements

### Requirement: R1: SDK 初始化单一路径
OTel SDK 初始化 SHALL 只经 `otel-preload.js`（`node -r` 前置加载）单一入口；
被替代的 bundle 内初始化路径 SHALL 不保留正式能力声明（无误导性 fallback）。

#### Scenario: 直跑不产生假健康
- Given 直接 `node dist/apps/mist/main.js`（无 -r preload）
- When 检查 SDK 初始化行为
- Then 不得出现"SDK 已初始化但 auto-instrumentation 静默失效"的中间状态，
      要么完整初始化（preload），要么明确不初始化

#### Scenario: 无死参数
- Given preload 已初始化 SDK
- When 检查 main.ts 的初始化调用
- Then 不得存在无效的 serviceName 参数（服务名只来自 OTEL_SERVICE_NAME env）
