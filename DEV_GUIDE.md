# Mist Backend - 开发环境快速指南

本文档说明如何使用提供的脚本快速启动和测试 Mist Backend。

## 🚀 快速开始

### 1. 一键启动所有服务

```bash
./start-dev.sh
```

这个脚本会自动：
- ✅ 检查端口占用（8080, 8001）
- ✅ 检查 MySQL 连接
- ✅ 创建数据库（如果不存在）
- ✅ 检查并安装 AKTools
- ✅ 启动 AKTools（端口 8080）
- ✅ 启动 Mist 应用（端口 8001）
- ✅ 等待服务就绪
- ✅ 显示服务状态和访问地址

### 2. 测试 API

```bash
./test-api.sh
```

快速测试所有关键端点：
- 健康检查
- 指数列表
- API 文档
- AKTools 连接

### 3. 停止所有服务

```bash
./stop-dev.sh
```

安全停止所有服务。

### 4. 快速重启

```bash
./restart-dev.sh
```

停止并重启所有服务（保留日志）。

---

## 📋 服务地址

启动成功后，可以访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| **Mist 应用** | http://localhost:8001 | 主应用 |
| **健康检查** | http://localhost:8001/app/hello | 测试应用是否运行 |
| **API 文档** | http://localhost:8001/api-docs | Swagger UI |
| **AKTools** | http://localhost:8080 | Python 数据源 |
| **AKTools 文档** | http://localhost:8080/docs | FastAPI 文档 |

---

## 📝 日志文件

日志保存在 `logs/` 目录：

```bash
# 查看 Mist 日志
tail -f logs/mist.log

# 查看 AKTools 日志
tail -f logs/aktools.log

# 查看所有日志
tail -f logs/*.log
```

---

## 🔧 环境配置

### MySQL 配置

默认配置（在 `start-dev.sh` 中）：
- 主机: `127.0.0.1`
- 端口: `3306`
- 用户: `root`
- 密码: `123456`
- 数据库: `mist`

**修改密码：**
编辑 `start-dev.sh`，修改这一行：
```bash
MYSQL_PASSWORD="${mysql_server_password:-123456}"
```

---

## 🧪 常用测试

### 测试健康检查

```bash
curl http://localhost:8001/app/hello
# 预期: Hello World!
```

### 获取指数列表

```bash
curl "http://localhost:8001/data/index?symbol=sh.000001"
```

### 测试 K 线数据

```bash
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "sh.000001",
    "period": "1min",
    "limit": 10
  }'
```

### 测试缠论分析

```bash
curl -X POST http://localhost:8001/chan/merge-k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "sh.000001",
    "period": "1min",
    "limit": 100
  }'
```

---

## 🐛 故障排查

### 端口被占用

```bash
# 查看占用端口的进程
lsof -i :8001
lsof -i :8080

# 停止占用端口的进程
kill -9 <PID>
```

### MySQL 连接失败

```bash
# 检查 MySQL 容器
podman ps | grep mysql

# 测试 MySQL 连接
podman exec epic_mestorf mysql -uroot -p123456

# 重启 MySQL 容器
podman restart epic_mestorf
```

### 应用启动失败

```bash
# 查看错误日志
tail -50 logs/mist.log

# 检查环境变量
env | grep mysql

# 手动启动（查看详细错误）
export mysql_server_host=127.0.0.1
export mysql_server_port=3306
export mysql_server_username=root
export mysql_server_password=123456
export mysql_server_database=mist
pnpm run start:dev:mist
```

### AKTools 启动失败

```bash
# 重新安装 AKTools
python3 -m pip install aktools --user --force-reinstall

# 手动测试 AKTools
python3 -m aktools
```

---

## 📦 与 Docker 部署的区别

### 开发环境（当前）
- 使用 `start-dev.sh`
- 直接在主机运行
- 代码热重载
- 详细日志输出
- 快速启动/重启

### 生产环境（Docker）
- 使用 `docker-compose up`
- 容器化部署
- 单个命令部署
- 环境隔离
- 生产级配置

---

## 🎯 下一步

1. **功能开发**
   - 修改代码后自动重新编译
   - 使用 `./restart-dev.sh` 快速重启

2. **测试 Podman 构建**
   ```bash
   podman build -t mist-backend .
   podman run -p 8001:8001 --env-file .env mist-backend
   ```

3. **合并到主分支**
   ```bash
   cd /Users/xiyugao/code/mist/mist
   git checkout main
   git merge .worktrees/infrastructure
   git push origin main
   ```

---

## 📚 相关文档

- [基础设施完整文档](../docs/INFRASTRUCTURE.md)
- [MCP Server 文档](../apps/mcp-server/README.md)
- [项目 README](../README.md)

---

## 💡 提示

- 首次运行前确保 MySQL 容器正在运行
- 使用 `Ctrl+C` 优雅停止所有服务
- 开发时推荐使用两个终端：一个运行服务，一个查看日志
- 如需修改环境变量，编辑 `start-dev.sh` 而不是 `.env` 文件

---

**最后更新**: 2026-03-18
**测试状态**: ✅ 所有测试通过（205/205）
