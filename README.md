# Mist - 智能股票分析系统

<p align="center">
  <strong>A 股市场智能分析与预警系统</strong>
</p>

---

## 📖 项目简介

Mist 是一个功能完整的股票市场分析系统，支持 A 股全市场（沪深两市）的技术分析与智能决策支持。采用 Monorepo 架构，集成了传统技术分析、缠论分析以及 AI 智能体系统，提供完整的 API 服务和 MCP Server 接口。

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

#### 方式一：使用开发脚本（推荐）

```bash
# 一键启动所有服务（自动检查 MySQL、AKTools、端口）
./start-dev.sh

# 停止所有服务
./stop-dev.sh

# 快速重启
./restart-dev.sh

# 测试 API
./test-api.sh
```

**脚本功能：**
- ✅ 自动检查端口占用（8080, 8001）
- ✅ 检查 MySQL 连接并创建数据库
- ✅ 自动安装并启动 AKTools
- ✅ 启动 Mist 应用
- ✅ 显示服务状态和访问地址

**服务地址：**
- Mist 应用: http://localhost:8001
- API 文档: http://localhost:8001/api-docs
- AKTools: http://localhost:8080

#### 方式二：手动启动

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

### 测试数据工作流

```bash
# 运行测试并生成结果
pnpm run test:full

# 仅生成类型定义（不运行测试）
pnpm run test:gen-types
```

生成的测试数据可用于：
- 单元测试和集成测试
- CI/CD 流程验证
- 算法正确性验证

---

## 🔐 安全性

- ✅ 已实现 API 限流（@nestjs/throttler）
- ✅ TypeORM 生产模式同步已禁用
- ✅ 环境变量敏感信息已分离

---

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 应用框架 | NestJS 10 |
| AI/LLM | LangChain/LangGraph, DeepSeek |
| 技术分析 | node-talib (164+ 函数) |
| 数据库 | MySQL with TypeORM |
| 调度器 | @nestjs/schedule |
| 时区 | date-fns-tz |
| MCP Server | @modelcontextprotocol/sdk |

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

## 🐳 Docker 部署

### 快速启动

```bash
# 构建所有服务
pnpm run build

# 使用 Docker Compose 启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### Docker Compose 服务

| 服务 | 端口 | 说明 |
|------|------|------|
| **mist** | 8001 | 主应用 - 股票分析 |
| **saya** | 8002 | AI 智能体系统 |
| **schedule** | 8003 | 定时任务 |
| **chan** | 8008 | 缠论测试入口 |
| **mcp-server** | 8009 | MCP Server |
| **mysql** | 3306 | MySQL 数据库 |
| **aktools** | 8080 | AKTools 数据源 |

### 环境变量配置

复制 `.env.example` 到 `.env` 并配置：

```env
NODE_ENV=production
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=mist
```

### Docker 特性

- **多阶段构建** - 优化镜像大小
- **健康检查** - 自动检测服务状态
- **优雅停机** - 正确处理 SIGTERM 信号
- **非 root 用户** - 提升安全性

---

## 🚀 CI/CD 和构建

### GitHub Actions 工作流

| 工作流 | 触发条件 | 功能 |
|--------|----------|------|
| **build.yml** | push to main/develop, PR | 构建跨平台可执行文件 |
| **docker.yml** | push to main/develop/feature/* | 构建 Docker 镜像 |
| **release.yml** | tag push (v*) | 创建 GitHub Release |

### 构建可执行文件

```bash
# 使用 pkg 构建独立可执行文件
pnpm run build
chmod +x tools/build-executable.sh

# Linux AMD64
./tools/build-executable.sh linux-amd64

# macOS AMD64
./tools/build-executable.sh macos-amd64

# macOS ARM64 (Apple Silicon)
./tools/build-executable.sh macos-arm64

# Windows x64
./tools/build-executable.sh windows-x86
```

**输出位置**: `dist/executables/`

### 发布新版本

```bash
# 创建版本标签
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions 自动：
# - 构建所有平台可执行文件
# - 创建 GitHub Release
# - 附加构建产物
```

---

## 🔌 MCP Server

Mist 提供 Model Context Protocol (MCP) Server，用于与 AI 应用集成。

### 启动 MCP Server

```bash
# 开发模式
pnpm run start:dev:mcp-server  # Port 8009

# Docker 模式
docker-compose up mcp-server
```

### 可用工具

| 工具 | 功能 |
|------|------|
| `get_k_line_data` | 获取 K 线数据 |
| `get_indicator_data` | 计算技术指标（MACD、RSI 等） |
| `merge_k_lines` | K 线合并（缠论） |
| `calculate_bi` | 计算笔（缠论） |
| `detect_channels` | 识别中枢（缠论） |
| `get_ai_analysis` | AI 智能体分析 |

### 客户端连接示例

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/apps/mcp-server/main.js']
});

const client = new Client({
  name: "mist-client",
  version: "1.0.0"
});

await client.connect(transport);

// 调用工具
const result = await client.callTool({
  name: "get_k_line_data",
  arguments: {
    symbol: "sh.000001",
    period: "daily",
    limit: 100
  }
});
```

---

## 🐛 故障排查

### 端口被占用

```bash
# 查看占用端口的进程
lsof -i :8001
lsof -i :8080

# 停止进程
kill -9 <PID>
```

### MySQL 连接失败

```bash
# 测试 MySQL 连接
mysql -h localhost -u root -p

# 检查数据库
SHOW DATABASES LIKE 'mist';

# 创建数据库
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

### AKTools 启动失败

```bash
# 重新安装 AKTools
python3 -m pip install aktools --user --force-reinstall

# 手动测试
python3 -m aktools
```

### Docker 构建失败

```bash
# 清理 Docker 缓存
docker system prune -a

# 无缓存构建
docker-compose build --no-cache
```

### 查看日志

```bash
# 开发环境日志
tail -f logs/mist.log
tail -f logs/aktools.log

# Docker 日志
docker-compose logs -f mist
docker-compose logs -f saya
```

---

## 📝 许可证

BSD-3-Clause

---

## 📮 相关文档

- [开发指南](CLAUDE.md) - Claude Code 开发指引
- [AI 智能体详细说明](apps/saya/README.md)
- [缠论算法说明](apps/chan/README.md)
- [项目路线图](Roadmap.md)
- [技术指标文档](Talib.md)
