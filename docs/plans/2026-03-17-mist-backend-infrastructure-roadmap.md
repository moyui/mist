# Mist 后端基础设施完善路线图

**日期**: 2026-03-17
**状态**: 设计阶段
**优先级**: C > B > A > D > E

## 概述

本文档描述了Mist后端项目的基础设施完善计划，包括Docker化部署、GitHub Actions CI/CD、数据库初始化、MCP Server完善以及缠论段功能扩展。

## 优先级顺序

1. **C. 数据库初始化脚本** (最高优先级)
2. **B. Docker化部署** (高优先级)
3. **A. MCP Server完善** (中优先级)
4. **D. 缠论段和段中枢** (低优先级 - 待规划)
5. **E. Bug修复** (持续进行)

---

## 阶段1：基础设施（2-3周）

### 1.1 技术栈

- **Node.js**: 24-alpine (最新LTS版本)
- **Python**: 3.13 (最新稳定版)
- **MySQL**: 8.4 LTS (外部管理)
- **包管理器**: pnpm
- **Python虚拟环境**: /app/python-venv

### 1.2 Docker配置

#### Dockerfile

```dockerfile
# 多阶段构建
FROM node:24-alpine AS builder
WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制依赖文件并安装
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm run build

# 生产镜像（Node.js + Python + 虚拟环境）
FROM node:24-alpine

# 安装Python 3.13和构建依赖
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-virtualenv \
    gcc \
    musl-dev \
    libffi-dev \
    curl

# 验证安装
RUN python3 --version && pip3 --version

# 安装pnpm
RUN npm install -g pnpm

WORKDIR /app

# 创建Python虚拟环境
RUN python3 -m venv /app/python-venv

# 激活虚拟环境并安装Python依赖
COPY requirements.txt ./
RUN . /app/python-venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 安装Node.js生产依赖
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

# 暴露端口
EXPOSE 8001 8008 8009 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8001/app/hello', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 复制启动脚本
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
```

#### docker-start.sh

```bash
#!/bin/sh
set -e

echo "🚀 Starting Mist Backend..."

# 启动AKTools（在虚拟环境中）
echo "📦 Starting AKTools on port 8080..."
. /app/python-venv/bin/activate
python -m aktools --host 0.0.0.0 --port 8080 &
AKTOOLS_PID=$!
echo "✅ AKTools started (PID: $AKTOOLS_PID)"

# 等待AKTools就绪
echo "⏳ Waiting for AKTools..."
while ! nc -z localhost 8080 2>/dev/null; do
  sleep 1
done
echo "✅ AKTools is ready!"

# 启动Node.js应用
echo "🎯 Starting Node.js application..."
echo "📦 Connecting to external MySQL at ${mysql_server_host}"

exec "$@"

# 清理：如果Node.js应用停止，也停止AKTools
trap "echo '🛑 Stopping AKTools...'; kill $AKTOOLS_PID 2>/dev/null" EXIT
```

#### docker-entrypoint.sh

```bash
#!/bin/sh
set -e

export PATH="/app/python-venv/bin:$PATH"
exec ./docker-start.sh "$@"
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  mist:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mist-backend
    ports:
      - "8001:8001"  # mist主应用
      - "8008:8008"  # chan测试入口
      - "8080:8080"  # 内置AKTools
    environment:
      - mysql_server_host=host.docker.internal
      - mysql_server_port=3306
      - mysql_server_username=${MYSQL_USER}
      - mysql_server_password=${MYSQL_PASSWORD}
      - mysql_server_database=mist
      - NODE_ENV=development
      - AKTOOLS_BASE_URL=http://localhost:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - mist-network
    volumes:
      - ./mist:/app/mist
      - ./dist:/app/dist
    command: ["pnpm", "run", "start:dev:mist"]

  mcp-server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mist-mcp-server
    ports:
      - "8009:8009"
      - "8081:8080"
    environment:
      - PORT=8009
      - mysql_server_host=host.docker.internal
      - mysql_server_port=3306
      - mysql_server_username=${MYSQL_USER}
      - mysql_server_password=${MYSQL_PASSWORD}
      - mysql_server_database=mist
      - NODE_ENV=development
      - AKTOOLS_BASE_URL=http://localhost:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - mist-network
    command: ["pnpm", "run", "start:dev:mcp-server"]

networks:
  mist-network:
    driver: bridge
```

### 1.3 环境变量

**项目根目录 .env:**
```bash
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
```

### 1.4 数据库管理

**用户手动管理MySQL：**
```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

**原则:**
- Docker容器不管理MySQL
- 用户负责数据库初始化
- 开发环境TypeORM自动创建表结构
- 生产环境使用迁移脚本

---

## 阶段2：部署优化（2-3周）

### 2.1 GitHub Actions CI/CD

#### 平台支持说明

**Docker镜像**: 仅支持Linux平台（linux/amd64, linux/arm64）
- 用于Linux服务器部署
- macOS和Windows用户应该使用可执行文件

**可执行文件**: 支持所有平台
- **linux-amd64**: Linux x86_64系统
- **macos-amd64**: macOS Intel芯片
- **macos-arm64**: macOS Apple芯片（M1/M2/M3）
- **windows-x86**: Windows x86_64系统

#### 构建可执行文件（全平台支持）

**`.github/workflows/build.yml`:**

```yaml
name: Build Executables

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    name: Build for ${{ matrix.platform }}
    runs-on: ${{ matrix.runner }}
    strategy:
      matrix:
        include:
          # Linux
          - platform: linux-amd64
            runner: ubuntu-latest
            target: node24-linux-x64
            output: mist-linux-amd64
          # macOS
          - platform: macos-amd64
            runner: macos-latest
            target: node24-macos-x64
            output: mist-macos-amd64
          - platform: macos-arm64
            runner: macos-latest
            target: node24-macos-arm64
            output: mist-macos-arm64
          # Windows
          - platform: windows-x86
            runner: windows-latest
            target: node24-win-x64
            output: mist-windows-x86.exe

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24.x

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build project
        run: pnpm run build

      - name: Run tests
        run: pnpm run test

      - name: Package executable
        run: |
          chmod +x tools/build-executable.sh
          ./tools/build-executable.sh ${{ matrix.platform }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mist-${{ matrix.platform }}
          path: dist/executables/${{ matrix.output }}
          retention-days: 7
```

#### 构建Docker镜像（仅Linux平台）

**说明**: Docker镜像主要用于Linux服务器部署。对于macOS和Windows，用户应该使用可执行文件。

**`.github/workflows/docker.yml`:**

```yaml
name: Build Docker Images

on:
  push:
    branches: [ main, develop ]
  workflow_dispatch:

jobs:
  build:
    name: Build for ${{ matrix.platform }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        platform:
          - os: linux
            arch: amd64
          - os: linux
            arch: arm64

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          platforms: ${{ matrix.platform.os }}/${{ matrix.platform.arch }}
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

#### 发布Release

**`.github/workflows/release.yml`:**

```yaml
name: Create Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build executables (all platforms)
        run: |
          chmod +x tools/package-release.sh
          ./tools/package-release.sh

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/mist-linux-amd64
            release/mist-macos-amd64
            release/mist-macos-arm64
            release/mist-windows-x86.exe
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2.2 构建脚本

#### tools/build-executable.sh

```bash
#!/bin/bash
set -e

PLATFORM=$1
OUTPUT_DIR="dist/executables"

mkdir -p $OUTPUT_DIR

case $PLATFORM in
  linux-amd64)
    pkg . --targets node24-linux-x64 --output $OUTPUT_DIR/mist-linux-amd64
    ;;
  macos-amd64)
    pkg . --targets node24-macos-x64 --output $OUTPUT_DIR/mist-macos-amd64
    ;;
  macos-arm64)
    pkg . --targets node24-macos-arm64 --output $OUTPUT_DIR/mist-macos-arm64
    ;;
  windows-x86)
    pkg . --targets node24-win-x64 --output $OUTPUT_DIR/mist-windows-x86.exe
    ;;
  *)
    echo "Unknown platform: $PLATFORM"
    echo "Supported: linux-amd64, macos-amd64, macos-arm64, windows-x86"
    exit 1
    ;;
esac

echo "✅ Build complete for $PLATFORM"
```

#### tools/package-release.sh

```bash
#!/bin/bash
set -e

echo "Packaging release for all platforms..."

mkdir -p release

# 构建所有平台
./tools/build-executable.sh linux-amd64
./tools/build-executable.sh macos-amd64
./tools/build-executable.sh macos-arm64
./tools/build-executable.sh windows-x86

# 复制到release目录
cp dist/executables/mist-* release/

echo "✅ Release packaging complete"
ls -lh release/
```

### 2.3 package.json依赖

```json
{
  "devDependencies": {
    "pkg": "^5.8.1"
  },
  "pkg": {
    "scripts": [
      "dist/apps/mist/main.js",
      "dist/apps/mcp-server/main.js"
    ],
    "assets": [
      "node_modules/**/*"
    ]
  }
}
```

---

## 阶段3：MCP Server完善（1-2周）

### 3.1 当前状态

**已有的20个MCP tools:**
- Chan Theory: 3 tools
- Technical Indicators: 6 tools
- Data Query: 5 tools
- Scheduled Tasks: 5 tools

### 3.2 需要完善的内容

1. **错误处理和重试机制**
2. **参数验证增强**
3. **性能监控**
4. **完善文档和示例**
5. **预留段相关接口**

### 3.3 段相关接口预留

```typescript
@Tool({
  name: 'create_segment',
  description: '从笔（Bi）数据中识别段（Segment）- TODO: 待实现',
})
async createSegment(params: z.infer<typeof SegmentSchema>) {
  return this.executeTool('create_segment', async () => {
    throw new Error('Segment识别功能待实现');
  });
}

@Tool({
  name: 'create_segment_channel',
  description: '从段（Segment）数据中识别段中枢 - TODO: 待实现',
})
async createSegmentChannel(params: z.infer<typeof SegmentChannelSchema>) {
  return this.executeTool('create_segment_channel', async () => {
    throw new Error('段中枢识别功能待实现');
  });
}
```

---

## 阶段4：持续改进

### 4.1 Bug修复

- 使用GitHub Issues追踪
- 优先修复阻塞性bug
- 每个版本包含bug修复

### 4.2 缠论段功能

**位置**: `apps/mist/src/chan/services/segment.service.ts`

**状态**: 待规划
- 等确定段的定义后实施
- MCP Server接口已预留
- 通过MCP Server暴露

---

## 文件结构

```
mist/
├── .github/
│   └── workflows/
│       ├── build.yml
│       ├── docker.yml
│       └── release.yml
├── database/
│   ├── migrations/
│   │   ├── 0.1.0-create-initial-schema.ts
│   │   ├── 0.2.0-add-index-tables.ts
│   │   └── 0.3.0-add-chan-tables.ts
│   ├── seeds/
│   │   ├── seed-indices.ts
│   │   └── seed-config.ts
│   └── scripts/
│       ├── init.ts
│       ├── migrate.ts
│       └── seed.ts
├── tools/
│   ├── build-executable.sh
│   ├── package-release.sh
│   └── db-init.sh
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
├── docker-start.sh
├── requirements.txt
└── .env
```

---

## 时间表

| 阶段 | 任务 | 时间 |
|------|------|------|
| 1 | 基础设施 | 2-3周 |
| 2 | 部署优化 | 2-3周 |
| 3 | MCP Server完善 | 1-2周 |
| 4 | 持续改进 | 持续 |

**总计**: 6-9周完成核心功能

---

## 交付成果

### 阶段1完成
- ✅ Dockerfile（node:24-alpine + python:3.13）
- ✅ docker-compose.yml
- ✅ Python虚拟环境
- ✅ AKTools集成
- ✅ 连接外部MySQL

### 阶段2完成
- ✅ GitHub Actions构建
- ✅ 多平台可执行文件（linux/macos/windows）
- ✅ Docker镜像（linux/amd64, linux/arm64）
- ✅ 自动Release

### 阶段3完成
- ✅ MCP Server审查
- ✅ 错误处理增强
- ✅ 段接口预留

---

## 使用方式

### 开发环境

```bash
# 1. 准备MySQL
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;

# 2. 配置环境变量
cat > .env << EOF
MYSQL_USER=root
MYSQL_PASSWORD=your_password
EOF

# 3. 启动服务
docker-compose up -d

# 4. 查看日志
docker-compose logs -f mist
```

### 生产环境

```bash
# 1. 拉取Docker镜像
docker pull ghcr.io/your-repo/mist:latest

# 2. 运行容器
docker run -d \
  --name mist-backend \
  -p 8001:8001 \
  -p 8009:8009 \
  -e mysql_server_host=your_mysql_host \
  -e mysql_server_port=3306 \
  -e mysql_server_username=root \
  -e mysql_server_password=your_password \
  ghcr.io/your-repo/mist:latest
```

### 下载可执行文件

```bash
# 从GitHub Release下载
https://github.com/your-repo/mist/releases/latest
```

---

## 设计决策

### 为什么选择单容器方案？
- 项目规模适合单容器
- 简化部署和运维
- 所有服务共享Python虚拟环境

### 为什么使用外部MySQL？
- 用户已有MySQL环境
- 避免数据迁移
- 简化Docker配置

### 为什么使用Python虚拟环境？
- 依赖隔离
- 版本管理
- 符合最佳实践

### 为什么预留段接口？
- 段的定义待确定
- 避免后期重构
- 保持架构完整性

---

## 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| MySQL连接问题 | 高 | 使用host.docker.internal |
| Python依赖冲突 | 中 | 使用虚拟环境隔离 |
| 多平台构建失败 | 中 | GitHub Actions矩阵测试 |
| Docker镜像过大 | 低 | 多阶段构建优化 |

---

## 后续考虑

- [ ] 添加Redis缓存（如果需要）
- [ ] 添加监控和日志聚合
- [ ] 实现数据库备份策略
- [ ] 性能优化和压力测试
- [ ] 完善API文档
