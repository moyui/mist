# Mist - 后端系统

<p align="center">
  <strong>智能股票市场分析与预警系统 - 后端服务</strong>
</p>

---

## 📖 项目简介

Mist 后端是基于 NestJS 构建的股票市场分析系统，专注于上证指数的技术分析与智能决策支持。采用 Monorepo 架构，集成了传统技术分析、缠论分析以及 AI 智能体系统。

### ✨ 核心功能

- **技术指标计算**：MACD、RSI、KDJ、ADX、ATR 等 164+ 种技术指标
- **缠论分析**：笔（Bi）、分型（Fenxing）、中枢（Channel）自动识别与计算
- **AI 多智能体**：基于 LangChain/LangGraph 的 7 角色智能体协作分析
- **多周期数据**：支持 1min、5min、15min、30min、60min、daily 等多种时间周期
- **定时任务**：自动数据采集与指标计算

---

## 🏗️ 系统架构

### Monorepo 结构

```
mist/
├── apps/                  # 应用程序
│   ├── mist/              # 主应用 - 技术分析与缠论 (Port 8001)
│   ├── saya/              # AI 智能体系统 (Port 8002)
│   ├── schedule/          # 定时任务 (Port 8003)
│   └── chan/              # 缠论测试入口 (Port 8008)
├── libs/                  # 共享库
│   ├── prompts/           # AI 提示词模板
│   ├── config/            # 配置管理
│   ├── utils/             # 共享工具
│   ├── shared-data/       # 数据模型
│   ├── timezone/          # 时区处理
│   └── constants/         # 常量定义
└── test-data/             # 测试数据
```

### 应用模块

| 应用 | 端口 | 功能描述 |
|------|------|----------|
| **mist** | 8001 | 主应用 - 数据采集、技术指标、缠论分析 |
| **saya** | 8002 | AI 智能体系统 - 多智能体协作分析 |
| **schedule** | 8003 | 定时任务 - 周期性数据采集 |
| **chan** | 8008 | 缠论测试 - K 线合并、笔计算、中枢识别 |

---

## 🚀 快速开始

### 前置要求

- **Node.js** 18+
- **MySQL** 8.0+
- **Python** 3.8+（用于 AKTools）
- **pnpm** 包管理器

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 配置环境变量

```bash
# 复制示例配置
cp apps/mist/src/.env.example apps/mist/src/.env
cp apps/saya/src/.env.example apps/saya/src/.env

# 编辑配置文件
# apps/mist/src/.env - MySQL、Redis 等配置
# apps/saya/src/.env - LLM API 配置
```

### 数据库设置

```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

### 启动 AKTools 数据源

AKTools 是用于获取股票数据的 Python FastAPI 服务。

```bash
# 创建 Python 虚拟环境
python3 -m venv python-env
source python-env/bin/activate  # Windows: python-env\Scripts\activate

# 安装 AKTools
pip install aktools

# 启动服务（默认端口 8080）
python -m aktools
```

**注意**：AKTools 不会在端口被占用时发出警告，请确保端口 8080 可用。

### 运行应用

```bash
# 开发模式 - 运行特定应用
pnpm run start:dev:mist     # 主应用 (port 8001)
pnpm run start:dev:saya     # AI 智能体系统 (port 8002)
pnpm run start:dev:chan     # 缠论测试入口 (port 8008)

# 生产模式
pnpm run build
pnpm run start:prod:mist
```

---

## 📚 功能模块

### 主应用 (mist)

**技术指标**：
- MACD - 指数平滑移动平均线
- RSI - 相对强弱指标
- KDJ - 随机指标
- ADX - 平均趋向指标
- ATR - 真实波幅

**缠论分析**：
- 合并 K（Merge K）- 基于包含关系的 K 线合并
- 分型（Fenxing）- 顶分型和底分型识别
- 笔（Bi）- 显著价格变动识别
- 中枢（Channel）- 整理区间识别

**API 文档**：http://localhost:8001/api-docs

### AI 智能体系统 (saya)

基于 LangChain/LangGraph 的多智能体架构：

| 角色 | 职责 |
|------|------|
| **Commander** | 接收用户指令、任务规划与协调 |
| **DataEngineer** | 数据获取、处理、计算、向量存储 |
| **Strategist** | 应用预定义策略规则，输出交易信号 |
| **PatternFinder** | 历史模式匹配与概率分析 |
| **SentimentAnalyst** | 新闻/社交媒体情绪分析 |
| **Reporter** | 生成报告和预警 |
| **RiskMonitor** | 市场和组合风险监控 |

### 定时任务 (schedule)

- 定时数据采集（多种时间周期）
- 定时指标计算
- 定时分析与预警

### 缠论测试 (chan)

专门的测试入口，用于：
- 测试缠论算法
- 调试 K 线合并逻辑
- 验证笔识别算法
- 检查中枢识别结果

---

## 🔧 开发指南

### 代码规范

```bash
# Lint 检查
pnpm run lint

# 代码格式化
pnpm run format
```

Git 提交前会自动运行检查（Husky + lint-staged）

### 测试

```bash
# 单元测试
pnpm run test

# E2E 测试
pnpm run test:e2e

# 测试覆盖率
pnpm run test:cov

# 监听模式
pnpm run test:watch

# 运行特定测试
pnpm run test:chan:shanghai-2024-2025
```

### 数据库迁移

```bash
# 生成迁移
pnpm run migration:generate -- -n MigrationName

# 运行迁移
pnpm run migration:run

# 回滚迁移
pnpm run migration:revert
```

### 构建

```bash
# 构建所有项目
pnpm run build
```

---

## 📖 API 文档

### Swagger UI

启动应用后访问：http://localhost:8001/api-docs

### 主要端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/app/hello` | GET | 健康检查 |
| `/indicator/k` | POST | K 线数据获取 |
| `/indicator/macd` | POST | MACD 计算 |
| `/indicator/rsi` | POST | RSI 计算 |
| `/indicator/kdj` | POST | KDJ 计算 |
| `/chan/merge-k` | POST | K 线合并 |
| `/chan/bi` | POST | 笔识别 |
| `/chan/channel` | POST | 中枢识别 |
| `/chan/fenxing` | POST | 分型识别 |

---

## 🗄️ 数据库

### TypeORM 配置

- 开发环境：自动同步（synchronize: true）
- 生产环境：需要使用迁移

### 时间周期

支持的时间周期：
- **1min** - 1 分钟
- **5min** - 5 分钟
- **15min** - 15 分钟
- **30min** - 30 分钟
- **60min** - 60 分钟
- **daily** - 日线

---

## 🧪 测试数据管理

### 目录结构

```
test-data/
├── fixtures/               # 测试输入数据
│   └── k-line/            # K 线原始数据
│       ├── shanghai-index-2024-2025.fixture.ts
│       └── ...
└── test-results/          # 测试输出
    ├── raw/               # JSON 结果
    │   └── shanghai-index-2024-2025-results.json
    └── types/             # TypeScript 定义
        └── shanghai-index-2024-2025-results.ts
```

### 同步到前端

```bash
# 运行测试并同步
pnpm run test:full

# 仅同步（不运行测试）
pnpm run test:sync

# 生成 TypeScript 定义
pnpm run test:gen-types
```

---

## 🔐 安全性

- ✅ 已实现 API 限流（@nestjs/throttler）
- ✅ TypeORM 生产模式同步已禁用
- ✅ 环境变量敏感信息已分离

---

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 后端框架 | NestJS 10 |
| AI/LLM | LangChain/LangGraph, DeepSeek |
| 技术分析 | node-talib (164+ 函数) |
| 数据库 | MySQL with TypeORM |
| 调度器 | @nestjs/schedule |
| 时区 | date-fns-tz |

---

## 📈 技术指标（node-talib）

本项目使用 [node-talib](https://github.com/oransel/node-talib) 实现了 **164+ 个技术分析函数**。

### 主要支持的指标

**趋势指标**：
- MA, EMA, SMA, WMA, DEMA, TEMA, TRIMA, KAMA, MAMA
- SAR, SAREXT

**动量指标**：
- MACD, MACDEXT, MACDFIX
- RSI, STOCH, STOCHF, STOCHRSI
- KDJ, ADX, ADXR, APO, CCI, CMO, DX, MOM, ROC, ROCP, ROCR, ROCR100, TRIX, ULTOSC, WILLR

**波动率指标**：
- ATR, NATR, TRANGE

**成交量指标**：
- AD, ADOSC, OBV

**K 线形态**：
- CDL2CROWS, CDL3BLACKCROWS, CDL3INSIDE, CDL3LINESTRIKE, CDL3OUTSIDE
- CDL3STARSINSOUTH, CDL3WHITESOLDIERS, CDLABANDONEDBABY, CDLADVANCEBLOCK
- ...（100+ 种 K 线形态识别）

### 完整函数列表

所有支持的 164+ 函数列表请查看项目的 [Talib 文档](Talib.md)。

### 使用示例

```typescript
import { MACD, RSI, KDJ } from 'talib';

// 计算 MACD
const macdResult = MACD(realData, {
  optInFastPeriod: 12,
  optInSlowPeriod: 26,
  optInSignalPeriod: 9
});

// 计算 RSI
const rsiResult = RSI(realData, {
  optInTimePeriod: 14
});

// 计算 KDJ
const kdjResult = KDJ(realData, {
  optInFastK_Period: 9,
  optInSlowK_Period: 3,
  optInSlowD_Period: 3
});
```

---

## 📝 已知问题

1. AKTools 在端口被占用时不会发出警告
2. date-fns-tz 的时区配置需要正确设置
3. 缠论算法可能需要针对不同市场条件进行调整

---

## 📝 许可证

BSD-3-Clause

---

## 📮 相关文档

- [前端项目](../mist-fe/)
- [AI 智能体详细说明](apps/saya/README.md)
- [缠论算法说明](apps/chan/README.md)
- [项目路线图](Roadmap.md)
