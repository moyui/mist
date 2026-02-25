# Mist

<p align="center">
  <strong>智能股票市场分析与预警系统</strong>
</p>

<p align="center">
  结合传统技术分析与 AI 智能体的上证指数分析平台
</p>

## 📖 简介

Mist 是一个基于 NestJS 构建的股票市场分析和预警系统，专注于上证指数的技术分析与智能决策支持。系统采用 Monorepo 架构，集成了传统技术分析指标、缠论分析模块以及基于 LangChain/LangGraph 的 AI 多智能体系统。

### ✨ 核心特性

- **技术指标分析**: MACD, RSI, KDJ, ADX, ATR 等 164+ 种技术指标
- **缠论分析**: 笔 (Bi)、分型 (Fenxing)、中枢 (Channel) 自动识别与计算
- **AI 多智能体**: 基于 LangChain/LangGraph 的 7 角色智能体协作分析系统
- **多周期数据**: 支持 1min, 5min, 15min, 30min, 60min, daily 等多种时间周期
- **实时预警**: 支持多种渠道的信号和风险预警推送

## 🏗️ 系统架构

```
mist/
├── apps/
│   ├── mist/       # 主应用 - 技术分析与缠论 (Port 8001)
│   ├── saya/       # AI 智能体系统 (Port 8002)
│   ├── schedule/   # 定时任务 (Port 8003)
│   └── chan/       # 通知模块
└── libs/
    ├── config/     # 配置管理
    ├── prompts/    # AI 提示词模板
    ├── utils/      # 共享工具
    ├── shared-data/# 数据模型
    ├── timezone/   # 时区处理
    └── constants/  # 常量定义
```

## 🚀 快速开始

### 前置要求

- **Node.js** 18+
- **MySQL** 8.0+
- **Python** 3.8+ (用于 AKTools 数据源服务)
- **pnpm** 包管理器

### 安装

```bash
# 克隆仓库
git clone https://github.com/moyui/mist.git
cd mist

# 安装依赖
pnpm install
```

### 配置环境变量

```bash
# 复制示例配置文件
cp apps/mist/src/.env.example apps/mist/src/.env
cp apps/saya/src/.env.example apps/saya/src/.env

# 编辑配置文件
# apps/mist/src/.env - MySQL、Redis 配置
# apps/saya/src/.env - LLM API 配置
```

### 数据库设置

```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

### 启动 AKTools 数据源服务

AKTools 是用于获取股票数据的 Python FastAPI 服务。

```bash
# 创建 Python 虚拟环境
python3 -m venv python-env
source python-env/bin/activate  # Windows: python-env\Scripts\activate

# 安装 AKTools
pip install aktools

# 启动服务 (默认端口 8080)
python -m aktools
```

### 运行应用

```bash
# 启动主应用 (技术分析)
pnpm run start:dev:mist    # http://localhost:8001

# 启动 AI 智能体系统
pnpm run start:dev:saya    # http://localhost:8002

# 启动定时任务
pnpm run start:dev:schedule # http://localhost:8003
```

## 📚 应用模块

### Mist (主应用)

**端口**: 8001

**核心功能:**
- 技术指标计算 (MACD, RSI, KDJ, ADX, ATR)
- 缠论分析 (笔、分型、中枢)
- 趋势判断
- K 线数据管理

**API 文档**: http://localhost:8001/api-docs

详细说明: [apps/mist/README.md](apps/mist/README.md)

### Saya (AI 智能体系统)

**端口**: 8002

**核心功能:**
- 多智能体协作分析
- DeepSeek LLM 集成
- 交易策略生成
- 风险监控

**智能体角色:**
| 角色 | 职责 |
|------|------|
| **Commander** | 任务规划与协调 |
| **DataEngineer** | 数据获取与处理 |
| **Strategist** | 策略分析 |
| **PatternFinder** | 模式匹配 |
| **SentimentAnalyst** | 情绪分析 |
| **Reporter** | 报告生成 |
| **RiskMonitor** | 风险监控 |

详细说明: [apps/saya/README.md](apps/saya/README.md)

### Chan (通知模块)

**核心功能:**
- 多渠道通知支持
- 预警管理
- 通知模板

详细说明: [apps/chan/README.md](apps/chan/README.md)

### Schedule (定时任务)

**端口**: 8003

**核心功能:**
- 定时数据采集
- 定时指标计算
- 定时分析与预警

## 🔧 开发指南

### 代码规范

```bash
# Lint 检查
pnpm run lint

# 代码格式化
pnpm run format
```

Git 提交前会自动运行检查 (Husky + lint-staged)

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
```

### 构建

```bash
# 构建所有项目
pnpm run build
```

## 🗄️ 数据库

### TypeORM 配置

- 开发环境: 自动同步 (synchronize: true)
- 生产环境: 需要使用迁移

```bash
# 生成迁移
pnpm run migration:generate -- -n MigrationName

# 运行迁移
pnpm run migration:run
```

### 时间周期

数据支持多种时间周期:
- 1min, 5min, 15min, 30min, 60min, daily

## 📖 API 文档

### Swagger UI

启动应用后访问:
- **Mist API**: http://localhost:8001/api-docs

### 主要端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/app/hello` | GET | 健康检查 |
| `/chan/merge-k` | POST | K 线合并 |
| `/chan/bi` | POST | 笔识别 |
| `/chan/channel` | POST | 中枢识别 |
| `/indicator/macd` | POST | MACD 计算 |
| `/indicator/rsi` | POST | RSI 计算 |
| `/indicator/kdj` | POST | KDJ 计算 |
| `/indicator/k` | POST | K 线数据 |

## 🔐 安全性

- 已实现 API 限流 (@nestjs/throttler)
- TypeORM 生产模式同步已禁用
- 环境变量敏感信息已分离

## 🛣️ Roadmap

- [ ] API 认证和授权 (JWT/API Key)
- [ ] Redis 缓存实现
- [ ] 更多技术指标 (Bollinger Bands, etc.)
- [ ] WebSocket 实时推送
- [ ] 前端可视化界面
- [ ] 更多股票市场支持

## 📝 许可证

BSD-3-Clause

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

- 项目主页: [GitHub](https://github.com/moyui/mist)
- 问题反馈: [Issues](https://github.com/moyui/mist/issues)
