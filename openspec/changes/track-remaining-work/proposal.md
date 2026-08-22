# Proposal: track-remaining-work

## Purpose

统一追踪 Mist 项目所有未完成事务——包括现有 active change 的剩余 tasks、代码质量整改遗留、前端迁移待办、以及环境阻塞项。本 change **不拥有任何新功能的实现**，只做状态追踪和盘点。

## Motivation

截至 2026-08-22，Mist 项目有 6 个 active OpenSpec change（共 ~50 项未完成），加上 remediation audit 74 条代码质量遗留、mist-fe 设计系统 Phase 3/5 未做、`feat/strategy-portfolio-backtesting` 分支已废弃等零散项。分散在各处导致无法一次性看清全貌。本 change 建立统一的 tracking 视图。

## Scope

**In scope:**
- 汇总所有 active change 的未完成 tasks（交叉引用，不抢 ownership）
- 汇总 `REMEDIATION_AUDIT_REPORT.md` 中 P1/P2 级未修复项
- 汇总 mist-fe design system 待做项（Phase 3/5）
- 汇总环境阻塞项（需要 Windows 机器 + TDX/QMT 终端 + 交易时段）
- 标记 `feat/strategy-portfolio-backtesting` 为废弃

**Out of scope:**
- 不实现任何新功能
- 不修改任何现有 change 的 tasks.md
- 不修改产品代码
- 不处理 P3 级 remediation 项（按计划暂缓）
