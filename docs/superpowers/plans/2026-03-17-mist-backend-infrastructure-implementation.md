# Mist Backend Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善Mist后端项目的基础设施，包括Docker化部署、GitHub Actions CI/CD和MCP Server完善

**Architecture:**
- 单容器Docker镜像，包含Node.js 24和Python 3.13虚拟环境
- 通过环境变量连接外部MySQL 8.4 LTS
- GitHub Actions构建多平台可执行文件和Docker镜像
- docker-compose编排mist和mcp-server服务

**Tech Stack:**
- Node.js 24-alpine, Python 3.13, MySQL 8.4 LTS
- pnpm, Docker, GitHub Actions
- TypeORM, NestJS, pkg

---

## File Structure

```
mist/
├── Dockerfile                              # 多阶段构建，Node.js + Python虚拟环境
├── docker-compose.yml                      # 编排mist和mcp-server服务
├── docker-entrypoint.sh                    # 入口脚本
├── docker-start.sh                         # 启动脚本（AKTools + Node.js）
├── requirements.txt                        # Python依赖（已存在）
├── .env                                    # Docker环境变量
├── .github/
│   └── workflows/
│       ├── build.yml                       # 构建可执行文件
│       ├── docker.yml                      # 构建Docker镜像
│       └── release.yml                     # 发布Release
├── tools/
│   ├── build-executable.sh                 # 单平台构建脚本
│   └── package-release.sh                  # 打包所有平台
└── apps/mcp-server/src/services/
    └── chan-mcp.service.ts                 # 添加段接口预留
```

---

## Phase 1: Docker Infrastructure (2-3 weeks)

### Task 1: Create Dockerfile with multi-stage build

**Files:**
- Create: `Dockerfile`

**Context:**
- 使用node:24-alpine作为基础镜像
- 多阶段构建：builder阶段编译TypeScript，生产阶段运行
- 安装Python 3.13和虚拟环境
- 复制requirements.txt并安装Python依赖
- 健康检查确保服务可用

- [ ] **Step 1: Create Dockerfile with builder stage**

```dockerfile
# Multi-stage build for Mist backend
FROM node:24-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy dependency files
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build
```

- [ ] **Step 2: Add production stage with Python 3.13**

```dockerfile
# Production image with Node.js + Python
FROM node:24-alpine

# Install Python 3.13 and build dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-virtualenv \
    gcc \
    musl-dev \
    libffi-dev \
    curl

# Verify installation
RUN python3 --version && pip3 --version

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app
```

- [ ] **Step 3: Create Python virtual environment**

```dockerfile
# Create Python virtual environment at /app/python-venv
RUN python3 -m venv /app/python-venv

# Activate and install Python dependencies from requirements.txt
COPY requirements.txt ./
RUN . /app/python-venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt
```

- [ ] **Step 4: Install Node.js production dependencies**

```dockerfile
# Install Node.js production dependencies
COPY package*.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
```

- [ ] **Step 5: Copy build artifacts and expose ports**

```dockerfile
# Copy build output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

# Expose ports
EXPOSE 8001 8008 8009 8080
```

- [ ] **Step 6: Add health check**

```dockerfile
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8001/app/hello', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

- [ ] **Step 7: Copy and prepare startup scripts**

```dockerfile
# Copy startup scripts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
```

- [ ] **Step 8: Verify Dockerfile syntax**

Run: `docker build --no-cache -t mist:test .`
Expected: Build completes successfully, image created

- [ ] **Step 9: Commit Dockerfile**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile with Node.js 24 and Python 3.13

- Multi-stage build for optimized image size
- Python virtual environment at /app/python-venv
- Install dependencies from requirements.txt
- Health check on port 8001
- Expose ports: 8001, 8008, 8009, 8080"
```

---

### Task 2: Create docker-start.sh to launch AKTools and Node.js

**Files:**
- Create: `docker-start.sh`

**Context:**
- 在Python虚拟环境中启动AKTools
- 等待AKTools就绪后再启动Node.js应用
- 使用trap确保AKTools在Node.js停止时也停止

- [ ] **Step 1: Create docker-start.sh with shebang**

```bash
#!/bin/sh
set -e

echo "🚀 Starting Mist Backend..."
```

- [ ] **Step 2: Start AKTools in virtual environment**

```bash
# Start AKTools (in virtual environment)
echo "📦 Starting AKTools on port 8080..."
. /app/python-venv/bin/activate
python -m aktools --host 0.0.0.0 --port 8080 &
AKTOOLS_PID=$!
echo "✅ AKTools started (PID: $AKTOOLS_PID)"
echo "📦 AKTools URL: http://localhost:8080"
```

- [ ] **Step 3: Wait for AKTools to be ready**

```bash
# Wait for AKTools to be ready
echo "⏳ Waiting for AKTools..."
while ! nc -z localhost 8080 2>/dev/null; do
  sleep 1
done
echo "✅ AKTools is ready!"
```

- [ ] **Step 4: Start Node.js application**

```bash
# Start Node.js application
echo "🎯 Starting Node.js application..."
echo "📦 Connecting to external MySQL at ${mysql_server_host}"

# Start application (foreground)
exec "$@"
```

- [ ] **Step 5: Add cleanup trap**

```bash
# Cleanup: stop AKTools when Node.js app stops
trap "echo '🛑 Stopping AKTools...'; kill $AKTOOLS_PID 2>/dev/null" EXIT
```

- [ ] **Step 6: Make script executable**

Run: `chmod +x docker-start.sh`
Expected: Script is executable

- [ ] **Step 7: Test script locally**

Run: `bash -n docker-start.sh`
Expected: No syntax errors

- [ ] **Step 8: Commit docker-start.sh**

```bash
git add docker-start.sh
git commit -m "feat: add docker-start.sh for AKTools and Node.js

- Start AKTools in Python virtual environment on port 8080
- Wait for AKTools to be ready before starting Node.js
- Trap to ensure AKTools stops when Node.js stops
- Informative logging with emojis"
```

---

### Task 3: Create docker-entrypoint.sh

**Files:**
- Create: `docker-entrypoint.sh`

**Context:**
- 设置PATH环境变量包含Python虚拟环境
- 委托给docker-start.sh执行

- [ ] **Step 1: Create docker-entrypoint.sh**

```bash
#!/bin/sh
set -e

# Set environment variables
export PATH="/app/python-venv/bin:$PATH"

# Execute startup script
exec ./docker-start.sh "$@"
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x docker-entrypoint.sh`
Expected: Script is executable

- [ ] **Step 3: Test script syntax**

Run: `bash -n docker-entrypoint.sh`
Expected: No syntax errors

- [ ] **Step 4: Commit docker-entrypoint.sh**

```bash
git add docker-entrypoint.sh
git commit -m "feat: add docker-entrypoint.sh

- Set PATH to include Python virtual environment
- Delegate to docker-start.sh for actual startup"
```

---

### Task 4: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Context:**
- 定义mist和mcp-server两个服务
- 使用host.docker.internal连接外部MySQL
- 两个服务都内置AKTools
- mist服务使用端口8001、8008、8080
- mcp-server服务使用端口8009、8081

- [ ] **Step 1: Create docker-compose.yml header**

```yaml
version: '3.8'

services:
```

- [ ] **Step 2: Define mist service**

```yaml
  # Mist main application (with built-in AKTools)
  mist:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mist-backend
    ports:
      - "8001:8001"  # mist main app
      - "8008:8008"  # chan test entry
      - "8080:8080"  # built-in AKTools
    environment:
      # MySQL config (connect to external MySQL)
      - mysql_server_host=host.docker.internal
      - mysql_server_port=3306
      - mysql_server_username=${MYSQL_USER}
      - mysql_server_password=${MYSQL_PASSWORD}
      - mysql_server_database=mist
      - NODE_ENV=development
      - AKTOOLS_BASE_URL=http://localhost:8080
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Access host machine's MySQL
    networks:
      - mist-network
    volumes:
      - ./mist:/app/mist
      - ./dist:/app/dist
    command: ["pnpm", "run", "start:dev:mist"]
```

- [ ] **Step 3: Define mcp-server service**

```yaml
  # MCP Server (with built-in AKTools)
  mcp-server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mist-mcp-server
    ports:
      - "8009:8009"     # MCP Server
      - "8081:8080"     # MCP Server's AKTools (different port)
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
```

- [ ] **Step 4: Define networks**

```yaml
networks:
  mist-network:
    driver: bridge
```

- [ ] **Step 5: Validate docker-compose.yml syntax**

Run: `docker-compose config`
Expected: Valid YAML output

- [ ] **Step 6: Commit docker-compose.yml**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for mist and mcp-server

- Mist service: ports 8001, 8008, 8080
- MCP Server service: ports 8009, 8081
- Both services connect to external MySQL via host.docker.internal
- Both services have built-in AKTools
- Bridge network for service communication"
```

---

### Task 5: Create .env template for Docker

**Files:**
- Create: `.env`

**Context:**
- Docker Compose环境变量模板
- 仅包含MySQL凭据

- [ ] **Step 1: Create .env file**

```bash
# .env (for Docker Compose)

# MySQL configuration (connect to external MySQL)
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
```

- [ ] **Step 2: Create .env.example**

```bash
# .env.example

MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
```

- [ ] **Step 3: Add .env to .gitignore**

Run: `echo ".env" >> .gitignore`
Expected: .env added to .gitignore

- [ ] **Step 4: Commit .env.example**

```bash
git add .env.example .gitignore
git commit -m "feat: add .env.example for Docker Compose

- Template for MySQL credentials
- Add .env to .gitignore"
```

---

### Task 6: Add pkg dependency to package.json

**Files:**
- Modify: `package.json`

**Context:**
- 添加pkg用于打包可执行文件
- 配置pkg打包入口和资源

- [ ] **Step 1: Add pkg to devDependencies**

```json
{
  "devDependencies": {
    "pkg": "^5.8.1"
  }
}
```

- [ ] **Step 2: Add pkg configuration**

```json
{
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

- [ ] **Step 3: Install pkg**

Run: `pnpm install`
Expected: pkg installed successfully

- [ ] **Step 4: Commit package.json**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add pkg for executable packaging

- Add pkg to devDependencies
- Configure pkg to package mist and mcp-server apps
- Include node_modules as assets"
```

---

### Task 7: Test Docker build and local deployment

**Files:**
- Test: Docker build and docker-compose

**Context:**
- 构建Docker镜像
- 启动服务验证功能
- 确保所有端口正常工作

- [ ] **Step 1: Build Docker image**

Run: `docker-compose build`
Expected: Build completes without errors

- [ ] **Step 2: Start services**

Run: `docker-compose up -d`
Expected: Containers start successfully

- [ ] **Step 3: Check container status**

Run: `docker-compose ps`
Expected: Both containers running

- [ ] **Step 4: Check mist service logs**

Run: `docker-compose logs mist`
Expected: AKTools started, Node.js application running

- [ ] **Step 5: Check mcp-server service logs**

Run: `docker-compose logs mcp-server`
Expected: AKTools started, MCP Server running

- [ ] **Step 6: Test mist service health check**

Run: `curl http://localhost:8001/app/hello`
Expected: Successful response

- [ ] **Step 7: Test AKTools in mist service**

Run: `curl http://localhost:8080/health`
Expected: AKTools health check passes

- [ ] **Step 8: Test mcp-server**

Run: `curl http://localhost:8009/health || echo "MCP Server running on different endpoint"`
Expected: MCP Server responding

- [ ] **Step 9: Stop services**

Run: `docker-compose down`
Expected: Containers stopped and removed

- [ ] **Step 10: Document Docker usage**

Create: `docs/docker-usage.md`

```markdown
# Docker Usage Guide

## Prerequisites

1. External MySQL 8.4 LTS with database named `mist`
2. Docker and Docker Compose installed

## Quick Start

1. Configure environment:
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

2. Start services:
```bash
docker-compose up -d
```

3. View logs:
```bash
docker-compose logs -f mist
docker-compose logs -f mcp-server
```

4. Stop services:
```bash
docker-compose down
```

## Services

- **Mist**: http://localhost:8001
- **Chan Test**: http://localhost:8008
- **MCP Server**: http://localhost:8009
- **AKTools (Mist)**: http://localhost:8080
- **AKTools (MCP)**: http://localhost:8081

## Troubleshooting

### Cannot connect to MySQL
- Ensure MySQL is running on host machine
- Check `host.docker.internal` resolves correctly
- Verify credentials in .env

### AKTools not starting
- Check Python dependencies in requirements.txt
- Review logs: `docker-compose logs mist | grep AKTools`

### Ports already in use
- Stop existing services: `docker-compose down`
- Check port usage: `lsof -i :8001`
```

- [ ] **Step 11: Commit documentation**

```bash
git add docs/docker-usage.md
git commit -m "docs: add Docker usage guide

- Prerequisites and quick start
- Service endpoints
- Troubleshooting guide"
```

---

## Phase 2: GitHub Actions CI/CD (2-3 weeks)

### Task 8: Create build-executable.sh script

**Files:**
- Create: `tools/build-executable.sh`

**Context:**
- 根据平台参数打包可执行文件
- 支持4个平台：linux-amd64, macos-amd64, macos-arm64, windows-x86

- [ ] **Step 1: Create tools directory**

Run: `mkdir -p tools`
Expected: Directory created

- [ ] **Step 2: Create build-executable.sh with shebang**

```bash
#!/bin/bash
set -e

PLATFORM=$1
OUTPUT_DIR="dist/executables"

mkdir -p $OUTPUT_DIR
```

- [ ] **Step 3: Add platform case statement**

```bash
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
```

- [ ] **Step 4: Add success message**

```bash
echo "✅ Build complete for $PLATFORM"
```

- [ ] **Step 5: Make script executable**

Run: `chmod +x tools/build-executable.sh`
Expected: Script is executable

- [ ] **Step 6: Test script (dry run)**

Run: `bash -n tools/build-executable.sh`
Expected: No syntax errors

- [ ] **Step 7: Commit build-executable.sh**

```bash
git add tools/build-executable.sh
git commit -m "feat: add build-executable.sh for cross-platform packaging

- Support: linux-amd64, macos-amd64, macos-arm64, windows-x86
- Use pkg for Node.js executable packaging
- Clear error messages for unsupported platforms"
```

---

### Task 9: Create package-release.sh script

**Files:**
- Create: `tools/package-release.sh`

**Context:**
- 构建所有平台的可执行文件
- 复制到release目录

- [ ] **Step 1: Create package-release.sh**

```bash
#!/bin/bash
set -e

echo "Packaging release for all platforms..."

mkdir -p release
```

- [ ] **Step 2: Build all platforms**

```bash
# Build all platforms
./tools/build-executable.sh linux-amd64
./tools/build-executable.sh macos-amd64
./tools/build-executable.sh macos-arm64
./tools/build-executable.sh windows-x86
```

- [ ] **Step 3: Copy to release directory**

```bash
# Copy to release directory
cp dist/executables/mist-* release/
```

- [ ] **Step 4: Add success message**

```bash
echo "✅ Release packaging complete"
ls -lh release/
```

- [ ] **Step 5: Make script executable**

Run: `chmod +x tools/package-release.sh`
Expected: Script is executable

- [ ] **Step 6: Commit package-release.sh**

```bash
git add tools/package-release.sh
git commit -m "feat: add package-release.sh for automated release building

- Build all 4 platforms sequentially
- Copy executables to release/ directory
- List final artifacts"
```

---

### Task 10: Create GitHub Actions workflow for building executables

**Files:**
- Create: `.github/workflows/build.yml`

**Context:**
- 在push到main/develop分支时触发
- 构建4个平台的可执行文件
- 上传构建产物

- [ ] **Step 1: Create .github/workflows directory**

Run: `mkdir -p .github/workflows`
Expected: Directory created

- [ ] **Step 2: Create build.yml header**

```yaml
name: Build Executables

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:
```

- [ ] **Step 3: Define build job with matrix**

```yaml
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
```

- [ ] **Step 4: Add checkout and setup steps**

```yaml
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
```

- [ ] **Step 5: Add build and test steps**

```yaml
      - name: Build project
        run: pnpm run build

      - name: Run tests
        run: pnpm run test
```

- [ ] **Step 6: Add package executable step**

```yaml
      - name: Package executable
        run: |
          chmod +x tools/build-executable.sh
          ./tools/build-executable.sh ${{ matrix.platform }}
```

- [ ] **Step 7: Add upload artifacts step**

```yaml
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mist-${{ matrix.platform }}
          path: dist/executables/${{ matrix.output }}
          retention-days: 7
```

- [ ] **Step 8: Validate YAML syntax**

Run: `yamllint .github/workflows/build.yml || echo "yamllint not installed, skipping"`
Expected: Valid YAML (if yamllint available)

- [ ] **Step 9: Commit build.yml**

```bash
git add .github/workflows/build.yml
git commit -m "feat: add GitHub Actions workflow for building executables

- Trigger on push to main/develop and PRs
- Build for 4 platforms: linux-amd64, macos-amd64, macos-arm64, windows-x86
- Upload artifacts with 7-day retention
- Run tests before packaging"
```

---

### Task 11: Create GitHub Actions workflow for Docker images

**Files:**
- Create: `.github/workflows/docker.yml`

**Context:**
- 构建linux/amd64和linux/arm64的Docker镜像
- 推送到GitHub Container Registry
- 支持跨平台运行（通过Docker Desktop）

- [ ] **Step 1: Create docker.yml header**

```yaml
name: Build Docker Images

on:
  push:
    branches: [ main, develop ]
  workflow_dispatch:
```

- [ ] **Step 2: Define build job with matrix**

```yaml
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
```

- [ ] **Step 3: Add checkout and Docker setup steps**

```yaml
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
```

- [ ] **Step 4: Add login to GHCR step**

```yaml
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 5: Add build and push step**

```yaml
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

- [ ] **Step 6: Validate YAML syntax**

Run: `yamllint .github/workflows/docker.yml || echo "yamllint not installed, skipping"`
Expected: Valid YAML (if yamllint available)

- [ ] **Step 7: Commit docker.yml**

```bash
git add .github/workflows/docker.yml
git commit -m "feat: add GitHub Actions workflow for Docker images

- Build linux/amd64 and linux/arm64 images
- Push to GitHub Container Registry (ghcr.io)
- Multi-platform support via QEMU
- Cache layers for faster builds"
```

---

### Task 12: Create GitHub Actions workflow for releases

**Files:**
- Create: `.github/workflows/release.yml`

**Context:**
- 在推送tag时触发（如v1.0.0）
- 构建所有平台的可执行文件
- 创建GitHub Release

- [ ] **Step 1: Create release.yml header**

```yaml
name: Create Release

on:
  push:
    tags:
      - 'v*'
```

- [ ] **Step 2: Define release job**

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
```

- [ ] **Step 3: Add steps**

```yaml
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
```

- [ ] **Step 4: Add build executables step**

```yaml
      - name: Build executables (all platforms)
        run: |
          chmod +x tools/package-release.sh
          ./tools/package-release.sh
```

- [ ] **Step 5: Add create release step**

```yaml
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

- [ ] **Step 6: Validate YAML syntax**

Run: `yamllint .github/workflows/release.yml || echo "yamllint not installed, skipping"`
Expected: Valid YAML (if yamllint available)

- [ ] **Step 7: Commit release.yml**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add GitHub Actions workflow for releases

- Trigger on version tags (v*)
- Build all platform executables
- Create GitHub Release with artifacts
- Publish as non-draft release"
```

---

### Task 13: Test GitHub Actions workflows

**Files:**
- Test: GitHub Actions workflows

**Context:**
- 推送代码触发workflows
- 验证build和docker workflows
- 测试tagged release

- [ ] **Step 1: Push changes to trigger workflows**

Run: `git push origin current-branch`
Expected: Workflows trigger on push

- [ ] **Step 2: Monitor build workflow**

Run: Visit GitHub Actions tab
Expected: Build workflow completes for all 4 platforms

- [ ] **Step 3: Download and test executable**

Run: Download linux-amd64 artifact from GitHub
Expected: Executable runs locally

- [ ] **Step 4: Monitor docker workflow**

Run: Check GitHub Actions for docker workflow
Expected: Docker images built and pushed to GHCR

- [ ] **Step 5: Test Docker image pull**

Run: `docker pull ghcr.io/your-repo/mist:latest`
Expected: Image pulls successfully

- [ ] **Step 6: Create test tag**

Run: `git tag v0.1.0-test && git push origin v0.1.0-test`
Expected: Release workflow triggers

- [ ] **Step 7: Verify release creation**

Run: Visit GitHub Releases page
Expected: Release created with all 4 executables

- [ ] **Step 8: Clean up test tag**

Run: `git tag -d v0.1.0-test && git push origin :refs/tags/v0.1.0-test`
Expected: Test tag removed

- [ ] **Step 9: Delete test release**

Run: Delete release on GitHub
Expected: Test release removed

- [ ] **Step 10: Document CI/CD process**

Create: `docs/ci-cd.md`

```markdown
# CI/CD Guide

## GitHub Actions Workflows

### Build Executables

**Trigger:** Push to `main` or `develop` branches

**Platforms:**
- linux-amd64
- macos-amd64
- macos-arm64
- windows-x86

**Artifacts:** Available for 7 days in Actions tab

### Build Docker Images

**Trigger:** Push to `main` or `develop` branches

**Platforms:**
- linux/amd64
- linux/arm64

**Registry:** `ghcr.io/your-repo/mist:latest`

### Create Release

**Trigger:** Version tags (e.g., `v1.0.0`)

**Artifacts:** All 4 platform executables attached to release

## Creating a Release

1. Update version in package.json
2. Commit changes:
```bash
git add package.json
git commit -m "chore: bump version to x.y.z"
```
3. Create and push tag:
```bash
git tag vx.y.z
git push origin vx.y.z
```
4. GitHub Actions will automatically:
   - Build all executables
   - Create release
   - Attach artifacts

## Testing Workflows Locally

Use [act](https://github.com/nektos/act) to test workflows locally:

```bash
# Install act
brew install act  # macOS

# Run build workflow
act -j build

# Run docker workflow
act -j build --job build
```
```

- [ ] **Step 11: Commit documentation**

```bash
git add docs/ci-cd.md
git commit -m "docs: add CI/CD guide

- GitHub Actions workflow descriptions
- Release creation process
- Local testing with act"
```

---

## Phase 3: MCP Server Completion (1-2 weeks)

### Task 14: Review existing MCP tools

**Files:**
- Review: `apps/mcp-server/src/services/*.ts`

**Context:**
- 审查现有的20个MCP tools
- 检查错误处理
- 验证参数验证

- [ ] **Step 1: List all MCP tools**

Run: `grep -r "@Tool" apps/mcp-server/src/services/ | wc -l`
Expected: Count ~20 tools

- [ ] **Step 2: Review error handling**

Check: Each tool uses `executeTool` wrapper
Expected: All tools have error handling

- [ ] **Step 3: Review parameter validation**

Check: Each tool has Zod schema
Expected: All tools validate parameters

- [ ] **Step 4: Document MCP tools inventory**

Create: `docs/mcp-tools-inventory.md`

```markdown
# MCP Tools Inventory

As of Phase 3, MCP Server has 20 tools:

## Chan Theory (3 tools)
- merge_k: Merge K-lines based on containment
- create_bi: Identify strokes (Bi) from K-lines
- analyze_chan_theory: Complete Chan Theory analysis

## Technical Indicators (6 tools)
- calculate_macd: MACD indicator
- calculate_rsi: RSI indicator
- calculate_kdj: KDJ indicator
- calculate_adx: ADX indicator
- calculate_atr: ATR indicator
- analyze_indicators: Complete indicator analysis

## Data Query (5 tools)
- get_index_info: Get index information
- get_kline_data: Get K-line data
- get_daily_kline: Get daily K-line data
- list_indices: List all available indices
- get_latest_data: Get latest data for all periods

## Scheduled Tasks (5 tools)
- trigger_data_collection: Trigger data collection
- list_scheduled_jobs: List scheduled tasks
- get_job_status: Get job status
- trigger_batch_collection: Batch trigger collection
- get_schedule_config: Get schedule configuration

## Segment Tools (2 tools - TODO)
- create_segment: Identify segments (NOT IMPLEMENTED)
- create_segment_channel: Identify segment channels (NOT IMPLEMENTED)
```

- [ ] **Step 5: Commit inventory documentation**

```bash
git add docs/mcp-tools-inventory.md
git commit -m "docs: add MCP tools inventory

- List all 20 existing tools
- Categorize by functionality
- Note segment tools as TODO"
```

---

### Task 15: Add segment tool stubs to MCP Server

**Files:**
- Modify: `apps/mcp-server/src/services/chan-mcp.service.ts`

**Context:**
- 预留段相关接口
- 抛出"待实现"错误
- 定义Zod schema为参数

- [ ] **Step 1: Add Segment Zod schema**

```typescript
const SegmentSchema = z.object({
  bis: z.array(z.object({
    id: z.number(),
    type: z.enum(['UP', 'DOWN']),
    start: z.object({
      time: z.string(),
      price: z.number(),
    }),
    end: z.object({
      time: z.string(),
      price: z.number(),
    }),
  })),
});
```

- [ ] **Step 2: Add SegmentChannel Zod schema**

```typescript
const SegmentChannelSchema = z.object({
  segments: z.array(z.object({
    id: z.number(),
    type: z.enum(['UP', 'DOWN']),
    start: z.object({
      time: z.string(),
      price: z.number(),
    }),
    end: z.object({
      time: z.string(),
      price: z.number(),
    }),
  })),
});
```

- [ ] **Step 3: Add createSegment tool stub**

```typescript
@Tool({
  name: 'create_segment',
  description: '从笔（Bi）数据中识别段（Segment）- TODO: 待实现',
})
async createSegment(params: z.infer<typeof SegmentSchema>) {
  return this.executeTool('create_segment', async () => {
    throw new Error(
      'Segment识别功能待实现。' +
      '定义：由连续的笔组成的更大级别的趋势线。' +
      '将在确定段的定义后实施。' +
      '位置：apps/mist/src/chan/services/segment.service.ts'
    );
  });
}
```

- [ ] **Step 4: Add createSegmentChannel tool stub**

```typescript
@Tool({
  name: 'create_segment_channel',
  description: '从段（Segment）数据中识别段中枢 - TODO: 待实现',
})
async createSegmentChannel(params: z.infer<typeof SegmentChannelSchema>) {
  return this.executeTool('create_segment_channel', async () => {
    throw new Error(
      '段中枢识别功能待实现。' +
      '定义：由3段重叠形成的整理区间。' +
      '将在确定段中枢的定义后实施。' +
      '位置：apps/mist/src/chan/services/segment-channel.service.ts'
    );
  });
}
```

- [ ] **Step 5: Update tool count in README**

Update: `apps/mcp-server/README.md`

```markdown
## Available MCP Tools

Total: 22 tools (20 implemented, 2 stubs)

**Implemented: 20 tools**
**Stubs: 2 tools** (segment-related, TODO)
```

- [ ] **Step 6: Test MCP Server compiles**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit segment stubs**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.ts apps/mcp-server/README.md
git commit -m "feat: add segment tool stubs to MCP Server

- Add create_segment tool (TODO)
- Add create_segment_channel tool (TODO)
- Define Zod schemas for future implementation
- Update README with tool count"
```

---

### Task 16: Add error handling improvements to MCP tools

**Files:**
- Modify: `apps/mcp-server/src/base/base-mcp-tool.service.ts`

**Context:**
- 增强executeTool wrapper
- 添加重试逻辑
- 改进错误消息

- [ ] **Step 1: Add retry logic to executeTool**

```typescript
async executeTool<T>(
  toolName: string,
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<any> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      this.logger.log(`[${toolName}] Attempt ${attempt}/${maxRetries}`);
      const result = await fn();

      if (attempt > 1) {
        this.logger.log(`[${toolName}] Succeeded on attempt ${attempt}`);
      }

      return this.success(result);
    } catch (error) {
      lastError = error;
      this.logger.error(
        `[${toolName}] Attempt ${attempt} failed: ${error.message}`
      );

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return this.error(
    `${toolName} failed after ${maxRetries} attempts: ${lastError.message}`,
    'MAX_RETRIES_EXCEEDED'
  );
}
```

- [ ] **Step 2: Add detailed error context**

```typescript
return this.error(
  `${toolName} failed: ${error.message}`,
  error.code || 'UNKNOWN_ERROR',
  {
    tool: toolName,
    attempts: maxRetries,
    lastError: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  }
);
```

- [ ] **Step 3: Update success method to include metadata**

```typescript
success(data: any, meta?: any) {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}
```

- [ ] **Step 4: Test error handling**

Run: Write unit test for retry logic
Expected: Retries work correctly

- [ ] **Step 5: Commit error handling improvements**

```bash
git add apps/mcp-server/src/base/base-mcp-tool.service.ts
git commit -m "feat: add retry logic and improved error handling to MCP tools

- Retry up to 3 times with exponential backoff
- Include detailed error context
- Add timestamp to all responses
- Better logging for debugging"
```

---

### Task 17: Document MCP Server usage

**Files:**
- Create: `docs/mcp-server-usage.md`

**Context:**
- 记录MCP Server使用方法
- 提供示例
- 说明tool调用方式

- [ ] **Step 1: Create usage documentation**

```markdown
# MCP Server Usage Guide

## Overview

MCP Server exposes Mist backend functionality via Model Context Protocol.

## Connection

### Local Development

```bash
pnpm run start:dev:mcp-server
```

Server runs on `http://localhost:8009`

### Docker

```bash
docker-compose up mcp-server
```

## Available Tools

See [MCP Tools Inventory](./mcp-tools-inventory.md)

## Example Usage

### Claude Desktop Integration

Add to Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mist": {
      "command": "node",
      "args": ["/path/to/dist/apps/mcp-server/main.js"],
      "env": {
        "NODE_ENV": "production",
        "mysql_server_host": "localhost",
        "mysql_server_port": "3306",
        "mysql_server_username": "root",
        "mysql_server_password": "your_password",
        "mysql_server_database": "mist"
      }
    }
  }
}
```

### Example Queries

**Get K-line data:**
> "Fetch the last 100 daily K-line data for Shanghai index"

**Analyze Chan Theory:**
> "Analyze the Chan Theory patterns for Shanghai index"

**Calculate indicators:**
> "Calculate MACD, RSI, and KDJ for the latest data"

## Response Format

All tools return:

```typescript
{
  success: true,
  data: any,
  timestamp: string,
  // ... additional metadata
}
```

Error response:

```typescript
{
  success: false,
  error: {
    message: string,
    code: string,
    context?: any
  },
  timestamp: string
}
```

## Troubleshooting

### Connection refused
- Ensure MCP Server is running
- Check port 8009 is not in use

### Database errors
- Verify MySQL is running
- Check credentials in .env

### Tool not found
- Ensure MCP Server is latest version
- Check MCP Tools Inventory
```

- [ ] **Step 2: Commit usage documentation**

```bash
git add docs/mcp-server-usage.md
git commit -m "docs: add MCP Server usage guide

- Connection methods (local/Docker)
- Claude Desktop integration
- Example queries
- Response format documentation
- Troubleshooting guide"
```

---

## Phase 4: Continuous Improvement

### Task 18: Create bug tracking template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`

**Context:**
- 标准化bug报告格式
- 收集必要信息
- 加速bug修复

- [ ] **Step 1: Create issue templates directory**

Run: `mkdir -p .github/ISSUE_TEMPLATE`
Expected: Directory created

- [ ] **Step 2: Create bug report template**

```markdown
---
name: Bug report
about: Report a problem with Mist backend
title: '[BUG] '
labels: bug
---

## Environment

- **Mist Version:**
- **Node.js Version:**
- **Python Version:**
- **MySQL Version:**
- **OS:**
- **Deployment:** (Docker / Executable / Source)

## Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Logs

```
Paste relevant logs here
```

## Screenshots

If applicable, add screenshots to help explain your problem.

## Additional Context

Add any other context about the problem here.
```

- [ ] **Step 3: Commit bug report template**

```bash
git add .github/ISSUE_TEMPLATE/bug_report.md
git commit -m "docs: add bug report template

- Standardize bug reports
- Collect environment information
- Guide users to provide useful details"
```

---

## Completion Tasks

### Task 19: Create final summary documentation

**Files:**
- Create: `docs/infrastructure-completion-summary.md`

**Context:**
- 总结所有完成的工作
- 记录关键决策
- 提供后续步骤

- [ ] **Step 1: Create completion summary**

```markdown
# Infrastructure Implementation Summary

**Completed:** 2026-03-17

## Phase 1: Docker Infrastructure ✅

**Deliverables:**
- Dockerfile with Node.js 24 and Python 3.13
- docker-compose.yml for service orchestration
- Startup scripts with AKTools integration
- Cross-platform support (Linux, macOS, Windows via Docker Desktop)

**Key Decisions:**
- Single container approach with Python virtual environment
- External MySQL management by user
- AKTools runs in same container

**Files Created:**
- Dockerfile
- docker-compose.yml
- docker-entrypoint.sh
- docker-start.sh
- .env.example
- docs/docker-usage.md

## Phase 2: GitHub Actions CI/CD ✅

**Deliverables:**
- Build executables for 4 platforms
- Build Docker images (linux/amd64, linux/arm64)
- Automated releases on version tags

**Key Decisions:**
- Use pkg for executable packaging
- Multi-platform builds via GitHub Actions matrix
- Push to GitHub Container Registry

**Files Created:**
- .github/workflows/build.yml
- .github/workflows/docker.yml
- .github/workflows/release.yml
- tools/build-executable.sh
- tools/package-release.sh
- docs/ci-cd.md

## Phase 3: MCP Server Completion ✅

**Deliverables:**
- Reviewed and documented 20 existing tools
- Added segment tool stubs (2 tools)
- Improved error handling with retry logic
- Created usage documentation

**Key Decisions:**
- Segment functionality deferred pending definition
- Enhanced error handling with retries
- Comprehensive documentation

**Files Modified:**
- apps/mcp-server/src/services/chan-mcp.service.ts
- apps/mcp-server/src/base/base-mcp-tool.service.ts

**Files Created:**
- docs/mcp-tools-inventory.md
- docs/mcp-server-usage.md

## Next Steps

1. **Segment Implementation** (Future)
   - Define segment (段) algorithm
   - Implement in `apps/mist/src/chan/services/segment.service.ts`
   - Update MCP Server stubs with real implementation

2. **Performance Monitoring** (Future)
   - Add metrics collection
   - Implement logging aggregation
   - Set up alerts

3. **Testing** (Ongoing)
   - Add E2E tests for Docker deployment
   - Test multi-platform executables
   - Verify CI/CD workflows

4. **Documentation** (Ongoing)
   - Keep docs updated with changes
   - Add more examples
   - Create video tutorials

## Lessons Learned

1. **Docker Single Container** works well for this project size
2. **Python Virtual Environment** simplifies dependency management
3. **GitHub Actions Matrix** makes multi-platform builds straightforward
4. **External MySQL** reduces complexity but requires manual setup

## Contributors

- Design and Implementation: [Team]
- Documentation: [Team]
- Testing: [Team]

## References

- Design Spec: `docs/plans/2026-03-17-mist-backend-infrastructure-roadmap.md`
- Implementation Plan: This document
- Docker Usage: `docs/docker-usage.md`
- CI/CD Guide: `docs/ci-cd.md`
- MCP Server Usage: `docs/mcp-server-usage.md`
```

- [ ] **Step 2: Commit completion summary**

```bash
git add docs/infrastructure-completion-summary.md
git commit -m "docs: add infrastructure implementation summary

- Document all completed phases
- Record key decisions and rationale
- Provide next steps for future work
- List lessons learned"
```

---

### Task 20: Final verification and cleanup

**Files:**
- All project files

**Context:**
- 最终检查所有文件
- 清理临时文件
- 确保所有更改已提交

- [ ] **Step 1: Check git status**

Run: `git status`
Expected: No uncommitted changes

- [ ] **Step 2: Verify all commits**

Run: `git log --oneline -20`
Expected: All features documented in commits

- [ ] **Step 3: Check for TODO comments**

Run: `grep -r "TODO" apps/mcp-server/ --include="*.ts" | grep -v "node_modules"`
Expected: Only segment-related TODOs present

- [ ] **Step 4: Run linter**

Run: `pnpm run lint`
Expected: No linting errors

- [ ] **Step 5: Run tests**

Run: `pnpm run test`
Expected: All tests pass

- [ ] **Step 6: Build project**

Run: `pnpm run build`
Expected: Build succeeds

- [ ] **Step 7: Test Docker build**

Run: `docker-compose build`
Expected: Docker image builds

- [ ] **Step 8: Create git tag for completion**

Run: `git tag -a infrastructure-v1.0 -m "Complete infrastructure implementation

- Phase 1: Docker Infrastructure
- Phase 2: GitHub Actions CI/CD
- Phase 3: MCP Server Completion
- Phase 4: Continuous Improvement setup"`
Expected: Tag created

- [ ] **Step 9: Push all changes**

Run: `git push && git push --tags`
Expected: All changes and tags pushed

- [ ] **Step 10: Create milestone in GitHub**

Run: Create milestone "Infrastructure v1.0" on GitHub
Expected: Milestone created with all issues closed

---

## Appendix: Environment Setup

### Local Development Setup

1. **Clone repository**
```bash
git clone <repository-url>
cd mist/mist
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Configure environment**
```bash
cp apps/mist/src/.env.example apps/mist/src/.env
# Edit .env with your configuration
```

4. **Setup Python environment**
```bash
# Verify Python 3.13 is installed
python3 --version

# Install AKTools and dependencies
pip install -r requirements.txt
```

5. **Setup MySQL**
```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

6. **Start development server**
```bash
pnpm run start:dev:mist
```

### Docker Development Setup

1. **Configure Docker environment**
```bash
cp .env.example .env
# Edit .env with MySQL credentials
```

2. **Start services**
```bash
docker-compose up -d
```

3. **View logs**
```bash
docker-compose logs -f mist
```

---

## Appendix: Troubleshooting

### Common Issues

**Issue:** Docker build fails with "python3: not found"
**Solution:** Ensure Dockerfile uses Alpine Linux 3.18+ which includes Python 3

**Issue:** pkg fails to package executable
**Solution:** Ensure TypeScript files are built first: `pnpm run build`

**Issue:** GitHub Actions workflow fails
**Solution:** Check workflow logs in Actions tab, verify secrets are configured

**Issue:** MCP Server tools not found
**Solution:** Ensure MCP Server is running on port 8009, check firewall settings

---

## Success Criteria

✅ **Phase 1 Success Criteria:**
- [x] Docker image builds successfully
- [x] Services start and run correctly
- [x] AKTools accessible on port 8080/8081
- [x] External MySQL connection works

✅ **Phase 2 Success Criteria:**
- [x] All 4 platform executables build
- [x] Docker images push to GHCR
- [x] GitHub Releases work correctly
- [x] Workflows trigger on appropriate events

✅ **Phase 3 Success Criteria:**
- [x] All 20 MCP tools reviewed
- [x] Segment stubs added
- [x] Error handling improved
- [x] Documentation complete

✅ **Phase 4 Success Criteria:**
- [x] Bug tracking in place
- [x] Documentation complete
- [x] All commits pushed
- [x] Git tag created

---

**Total Estimated Time:** 6-9 weeks

**Actual Completion:** TBD
