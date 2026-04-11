#!/bin/sh
set -e

echo "🚀 Starting Mist Backend..."
echo "📦 Connecting to MySQL at ${mysql_server_host}:${mysql_server_port}"
echo "🎯 Node.js environment: ${NODE_ENV:-development}"

# Start application (foreground)
exec "$@"
