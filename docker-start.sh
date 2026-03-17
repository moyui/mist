#!/bin/sh
set -e

echo "🚀 Starting Mist Backend..."

# Cleanup: stop AKTools when Node.js app stops
trap "echo '🛑 Stopping AKTools...'; kill $AKTOOLS_PID 2>/dev/null" EXIT

# Start AKTools (in virtual environment)
echo "📦 Starting AKTools on port 8080..."
. /app/python-venv/bin/activate
python -m aktools --host 0.0.0.0 --port 8080 &
AKTOOLS_PID=$!
echo "✅ AKTools started (PID: $AKTOOLS_PID)"
echo "📦 AKTools URL: http://localhost:8080"

# Wait for AKTools to be ready
echo "⏳ Waiting for AKTools..."
while ! nc -z localhost 8080 2>/dev/null; do
  sleep 1
done
echo "✅ AKTools is ready!"

# Start Node.js application
echo "🎯 Starting Node.js application..."
echo "📦 Connecting to external MySQL at ${mysql_server_host}"

# Start application (foreground)
exec "$@"
