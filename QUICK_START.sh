#!/bin/bash
# 快速参考卡片

cat << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║         Mist Backend - 开发环境快速参考                      ║
╚════════════════════════════════════════════════════════════════╝

🚀 启动服务:
   ./start-dev.sh

🧪 测试 API:
   ./test-api.sh

🛑 停止服务:
   ./stop-dev.sh

🔄 快速重启:
   ./restart-dev.sh

📋 查看日志:
   tail -f logs/mist.log      # Mist 应用
   tail -f logs/aktools.log   # AKTools

🌐 服务地址:
   • Mist 应用:    http://localhost:8001
   • API 文档:     http://localhost:8001/api-docs
   • 健康检查:     http://localhost:8001/app/hello
   • AKTools:      http://localhost:8080

📖 完整文档:
   cat DEV_GUIDE.md

🐛 故障排查:
   1. 查看日志: tail -50 logs/mist.log
   2. 检查端口: lsof -i :8001
   3. 重启服务: ./restart-dev.sh

📦 切换到生产部署（Docker）:
   cd /Users/xiyugao/code/mist/mist
   git checkout main
   git merge .worktrees/infrastructure
   podman-compose build
   podman-compose up -d

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 测试状态: 205/205 通过 | 📅 最后更新: 2026-03-18
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
