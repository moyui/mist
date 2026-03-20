#!/bin/sh
set -e

echo "🚀 Starting Mist Backend..."
echo "📦 AKTools URL: ${AKTOOLS_BASE_URL:-http://aktools:8080}"
echo "📦 Connecting to MySQL at ${mysql_server_host}:${mysql_server_port}"
echo "🎯 Node.js environment: ${NODE_ENV:-development}"

# Start application (foreground)
exec "$@"
