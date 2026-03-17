#!/bin/sh
set -e

# Set environment variables
export PATH="/app/python-venv/bin:$PATH"

# Execute startup script
exec ./docker-start.sh "$@"
