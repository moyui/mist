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
- **MCP Server**：基于 Model Context Protocol 的 AI 集成接口，提供 17+ 工具
- **多数据源管理**：支持东方财富（ef）、通达信（tdx）、迈吉马克特（mqmt）等多个数据源
- **多周期数据**：支持 1min、5min、15min、30min、60min、daily 等多种时间周期
- **定时任务**：自动数据采集与指标计算
- **数据源桥接**：mist-datasource 模块支持 TDX/QMT SDK 的跨平台 HTTP/WebSocket 服务

---

## 🏗️ 系统架构

### Monorepo 结构

```
mist/
├── apps/                  # 应用程序
│   ├── mist/              # 主应用 - 技术分析与缠论 (Port 8001)
│   ├── saya/              # AI 智能体系统 (Port 8002)
│   ├── schedule/          # 定时任务 (Port 8003)
│   ├── chan/              # 缠论测试入口 (Port 8008)
│   └── mcp-server/        # MCP Server (Port 8009)
├── libs/                  # 共享库
│   ├── prompts/           # AI 提示词模板
│   ├── config/            # 配置管理
│   ├── utils/             # 共享工具
│   ├── shared-data/       # 数据模型
│   ├── timezone/          # 时区处理
│   └── constants/         # 常量定义（错误码、趋势方向等）
└── test-data/             # 测试数据
```

### 应用模块

| 应用 | 端口 | 功能描述 |
|------|------|----------|
| **mist** | 8001 | 主应用 - 数据采集、技术指标、缠论分析 |
| **saya** | 8002 | AI 智能体系统 - 多智能体协作分析 |
| **schedule** | 8003 | 定时任务 - 周期性数据采集 |
| **chan** | 8008 | 缠论测试 - K 线合并、笔计算、中枢识别 |
| **mcp-server** | 8009 | MCP Server - AI 应用集成接口 |

---

## 🚀 部署方式

本项目提供两种部署方式：

### 方式一：Docker 部署（推荐用于生产环境）

#### 快速启动

```bash
# 1. 配置环境变量
cd mist
cp .env.example .env
vim .env  # 设置 MYSQL_PASSWORD 等配置

# 2. 启动所有服务
docker-compose up -d

# 3. 查看状态
docker-compose ps
```

#### 服务架构

```
┌──────────────────────────────────────────────────────┐
│              Docker Network: mist-network             │
│                                                      │
│  ┌────────────┐      ┌────────────┐                 │
│  │   mist     │─────▶│  aktools   │                 │
│  │  (8001)    │      │   (8080)   │                 │
│  │  主应用    │      │   数据源   │                 │
│  └────────────┘      └────────────┘                 │
│       │                                              │
│  ┌────────────┐      ┌────────────┐                 │
│  │ mcp-server │      │   chan     │                 │
│  │  (8009)    │──────│   (8008)   │                 │
│  │ MCP服务    │      │  缠论测试  │                 │
│  └────────────┘      └────────────┘                 │
└──────────────────────┼───────────────────────────────┘
                       │
                       ▼
                ┌────────────┐
                │   MySQL    │
                │  (外部DB)   │
                └────────────┘
```

#### 环境变量配置

编辑 `.env` 文件：

```bash
# 必需配置
MYSQL_PASSWORD=your_mysql_password

# 可选配置
REPO_OWNER=your-github-username  # 默认: moyui
VERSION=latest                    # 或指定版本: v1.0.0
NODE_ENV=production              # 运行环境
```

#### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| **mist** | 8001 | 主应用 API |
| **mist** | 8008 | Chan Theory 测试入口 |
| **mcp-server** | 8009 | MCP Server |
| **aktools** | 8080 | AKTools 数据源服务 |

#### 版本管理

```bash
# 查看当前版本
docker-compose images

# 升级到新版本
VERSION=v1.2.0 docker-compose pull
docker-compose up -d

# 回滚到指定版本
VERSION=v1.1.0 docker-compose up -d
```

#### 健康检查

```bash
# 检查所有服务状态
docker-compose ps

# 检查服务健康状态
curl http://localhost:8080/docs      # AKTools
curl http://localhost:8001/app/hello # 主应用
```

#### 停止和清理

```bash
# 停止服务
docker-compose down

# 停止并删除数据卷
docker-compose down -v

# 查看日志
docker-compose logs -f --tail=100
```

---

### 方式二：本地开发（推荐用于开发调试）

#### 前置要求

- **Node.js** 20+
- **MySQL** 8.0+
- **Python** 3.12+（用于 AKTools 和 mist-datasource）
- **pnpm** 包管理器

#### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

#### 配置环境变量

```bash
# 复制示例配置
cp apps/mist/src/.env.example apps/mist/src/.env
cp apps/saya/src/.env.example apps/saya/src/.env

# 编辑配置文件
# apps/mist/src/.env - MySQL、Redis 等配置
# apps/saya/src/.env - LLM API 配置
```

#### 数据库设置

```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

#### 启动 AKTools 数据源

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

#### 运行应用

```bash
# 开发模式 - 运行特定应用
pnpm run start:dev:mist       # 主应用 (port 8001)
pnpm run start:dev:saya       # AI 智能体系统 (port 8002)
pnpm run start:dev:schedule   # 定时任务 (port 8003)
pnpm run start:dev:chan       # 缠论测试入口 (port 8008)
pnpm run start:dev:mcp-server # MCP Server (port 8009)

# 调试模式
pnpm run start:debug:chan       # 调试缠论
pnpm run start:debug:mcp-server # 调试 MCP Server

# 生产模式
pnpm run build
pnpm run start:prod
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

**多数据源管理**：
- 支持多个数据源（东方财富 ef、通达信 tdx、mimiQmt）
- 统一的股票管理接口
- 灵活的数据采集配置
- 自动数据源切换和故障转移

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

### MCP Server (mcp-server)

基于 Model Context Protocol 的 AI 集成接口，提供 17+ 工具：

| 分类 | 工具 | 功能 |
|------|------|------|
| **缠论工具** | merge_k | K 线合并 |
| | create_bi | 计算笔 |
| | get_fenxing | 分型识别 |
| | analyze_chan_theory | 完整缠论分析 |
| **技术指标工具** | MACD / RSI / KDJ / ADX / ATR | 单项指标计算 |
| | analyze_indicators | 综合指标分析 |
| **数据查询工具** | get_index_info | 获取指数信息 |
| | get_kline_data | 获取 K 线数据 |
| | get_daily_kline | 获取日线数据 |
| | list_indices | 列出所有指数 |
| | get_latest_data | 获取最新数据 |
| **定时任务工具** | trigger_data_collection | 触发数据采集 |
| | trigger_batch_collection | 批量数据采集 |
| | list_scheduled_jobs | 列出定时任务 |

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

# 深度集成测试
pnpm run test:deep
pnpm run test:deep:watch

# 运行测试并同步到前端
pnpm run test:full

# 生成 TypeScript 类型定义
pnpm run test:gen-types
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
| `/indicator/adx` | POST | ADX 计算 |
| `/indicator/atr` | POST | ATR 计算 |
| `/indicator/dualma` | POST | 双均线计算 |
| `/chan/merge-k` | POST | K 线合并 |
| `/chan/bi` | POST | 笔识别 |
| `/chan/channel` | POST | 中枢识别 |
| `/chan/fenxing` | POST | 分型识别 |

### 统一响应格式

所有 HTTP 端点返回统一格式的响应：

**成功响应：**
```json
{
  "success": true,
  "code": 200,
  "message": "SUCCESS",
  "data": {},
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123xyz"
}
```

**错误响应：**
```json
{
  "success": false,
  "code": 1001,
  "message": "INVALID_PARAMETER",
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "err-1710819800000-def456uvw"
}
```

**错误码范围：**
- `200`：成功
- `1xxx`：客户端错误（参数验证、格式错误）
- `2xxx`：业务错误（数据未找到、数据不足）
- `5xxx`：服务端错误（数据库、外部服务）

### 多数据源管理 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/security/init` | POST | 初始化股票 |
| `/v1/security/add-source` | POST | 添加/更新数据源 |
| `/v1/security/deactivate` | POST | 停用股票 |
| `/v1/security/activate` | POST | 启用股票 |
| `/v1/security/:code` | GET | 获取股票信息 |
| `/v1/collector/collect` | POST | 采集 K 线数据 |
| `/v1/collector/status/:code/:period` | GET | 获取采集状态 |

---

## 🔌 MCP Server

Mist 提供 Model Context Protocol (MCP) Server，用于与 AI 应用集成。

### 启动 MCP Server

```bash
# 开发模式
pnpm run start:dev:mcp-server  # Port 8009

# 调试模式
pnpm run start:debug:mcp-server

# Docker 模式
docker-compose up mcp-server
```

### 可用工具（17+）

| 分类 | 工具 | 功能 |
|------|------|------|
| **缠论工具** | `merge_k` | K 线合并（缠论） |
| | `create_bi` | 计算笔（缠论） |
| | `get_fenxing` | 分型识别（缠论） |
| | `analyze_chan_theory` | 完整缠论分析 |
| **技术指标工具** | MACD / RSI / KDJ / ADX / ATR | 单项指标计算 |
| | `analyze_indicators` | 综合指标分析 |
| **数据查询工具** | `get_index_info` | 获取指数信息 |
| | `get_kline_data` | 获取 K 线数据 |
| | `get_daily_kline` | 获取日线数据 |
| | `list_indices` | 列出所有指数 |
| | `get_latest_data` | 获取最新数据 |
| **定时任务工具** | `trigger_data_collection` | 触发数据采集 |
| | `trigger_batch_collection` | 批量数据采集 |
| | `list_scheduled_jobs` | 列出定时任务 |

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

## 🐳 Docker 镜像

### 镜像构建

项目使用 GitHub Actions 自动构建和发布 Docker 镜像：

- **触发条件**：Push to `master` 分支或创建 Git Tag
- **镜像仓库**：`ghcr.io/moyui/mist`
- **构建内容**：
  - 主应用镜像：`ghcr.io/moyui/mist`（Node.js 24 + NestJS）
  - AKTools 镜像：`ghcr.io/moyui/mist/aktools`（Python 3.13）

### 本地构建镜像

```bash
cd mist

# 构建主应用镜像
docker build -t mist:latest .

# 构建 AKTools 镜像
docker build -f Dockerfile.aktools -t mist-aktools:latest .
```

---

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| 应用框架 | NestJS 10 |
| AI/LLM | LangChain/LangGraph, DeepSeek |
| 技术分析 | node-talib (164+ 函数) |
| 数据库 | MySQL with TypeORM |
| MCP Server | @modelcontextprotocol/sdk, @rekog/mcp-nest |
| 调度器 | @nestjs/schedule |
| 时区 | date-fns-tz |
| 数据验证 | zod, class-validator |
| 前端 | Next.js 16, React 19, ECharts 6 |
| 数据源桥接 | FastAPI, Python 3.12+ |

---

## 🐛 故障排查

### Docker 部署问题

**AKTools 无法启动**
```bash
# 查看日志
docker-compose logs aktools

# 手动测试 AKTools
docker run --rm ghcr.io/moyui/mist/aktools:latest
```

**主应用无法连接 AKTools**
```bash
# 检查网络
docker network inspect mist_mist-network

# 测试容器间连接
docker exec mist-backend curl -f http://aktools:8080/docs
```

**MySQL 连接失败**
```bash
# 检查 host.docker.internal 配置
docker exec mist-backend ping -c 3 host.docker.internal

# 测试 MySQL 端口
docker exec mist-backend nc -zv host.docker.internal 3306
```

### 本地开发问题

**端口被占用**
```bash
# 查看占用端口的进程
lsof -i :8001
lsof -i :8008
lsof -i :8009
lsof -i :8080

# 停止进程
kill -9 <PID>
```

**MySQL 连接失败**
```bash
# 测试 MySQL 连接
mysql -h localhost -u root -p

# 检查数据库
SHOW DATABASES LIKE 'mist';

# 创建数据库
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

**AKTools 启动失败**
```bash
# 重新安装 AKTools
python3 -m pip install aktools --user --force-reinstall

# 手动测试
python3 -m aktools
```

### 常用命令

```bash
# 查看当前运行的版本
docker-compose images

# 只重启单个服务
docker-compose restart mist
docker-compose restart aktools
docker-compose restart mcp-server

# 进入容器调试
docker exec -it mist-backend sh
docker exec -it mist-aktools sh
docker exec -it mist-mcp-server sh

# 查看日志
docker-compose logs -f --tail=100
```

---

## 🔐 安全性

- ✅ 已实现 API 限流（@nestjs/throttler）
- ✅ TypeORM 生产模式同步已禁用
- ✅ 环境变量敏感信息已分离

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
