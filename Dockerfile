# Multi-stage build for Mist backend
# Stage 1: Builder - Compile TypeScript
FROM node:24-alpine AS builder
WORKDIR /app

# Install pnpm and configure Taobao registry
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# Copy dependency files
COPY package*.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.npm \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# Stage 2: Production - Run with Node.js + Python
FROM node:24-alpine

# Install Python 3.13, build dependencies, and netcat for health checks
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-virtualenv \
    gcc \
    musl-dev \
    libffi-dev \
    curl \
    netcat-openbsd \
    wget

# Verify installation
RUN python3 --version && pip3 --version

# Install pnpm and configure Taobao registry
RUN npm install -g pnpm

WORKDIR /app

# Create Python virtual environment at /app/python-venv
RUN python3 -m venv /app/python-venv

# Activate and install Python dependencies from requirements.txt
COPY requirements.txt ./
RUN . /app/python-venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Node.js production dependencies (using Taobao registry)
COPY package*.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.npm \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy build output from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm

# Expose ports
# 8001: Main mist app
# 8008: Chan test entry
# 8009: MCP server
# 8080: AKTools Python server
EXPOSE 8001 8008 8009 8080

# Health check - verify main app is responding (using wget for reliability)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8001/app/hello || exit 1

# Copy and prepare startup scripts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
