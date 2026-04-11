#!/bin/sh
set -e

# Execute startup script
exec ./docker-entrypoint.sh "$@"
