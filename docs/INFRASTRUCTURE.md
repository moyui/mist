# Mist Infrastructure Documentation

## Overview

This document provides comprehensive documentation for the Mist backend infrastructure, including deployment, building, CI/CD workflows, and MCP server integration.

## 1. Docker Deployment

### Quick Start

```bash
# Build all services
pnpm run build

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

### Docker Compose Configuration

**`docker-compose.yml`** - Multi-service orchestration:
- **mist** (Port 8001) - Main stock analysis application
- **saya** (Port 8002) - AI Agent system
- **schedule** (Port 8003) - Scheduled tasks
- **chan** (Port 8008) - Chan Theory test entry
- **mcp-server** (Port 8009) - MCP server
- **mysql** (Port 3306) - Database service

**Environment Variables:**
- `NODE_ENV=production`
- `PORT=8001` (per service)
- `DB_HOST=mysql`
- `DB_USER=root`
- `DB_PASSWORD=your_password`

### Dockerfile Configuration

**Multi-stage build for production:**
- Stage 1: Install dependencies
- Stage 2: Build applications
- Stage 3: Production runtime with optimized settings

**Key optimizations:**
- Node.js 18 Alpine base image
- Non-root user `node`
- Health checks on `/app/hello` endpoint
- Proper signal handling for graceful shutdown

## 2. Building Executables

### Platform-Specific Builds

#### Linux (x64)
```bash
# Build for Linux 64-bit
pnpm run build:linux64

# Package with PKGBUILD (Arch Linux)
docker run -v $(pwd):/build archlinux:latest /build/scripts/pkgbuild.sh
```

#### macOS (Intel/Apple Silicon)
```bash
# Build for Intel Mac
pnpm run build:macos64

# Build for Apple Silicon (M1/M2)
pnpm run build:macosarm64

# Universal binary (Intel + Apple Silicon)
pnpm run build:macosuniversal
```

#### Windows (64-bit)
```bash
# Build for Windows 64-bit
pnpm run build:win64

# Package with NSIS installer
docker run -v $(pwd):/build node:18-alpine /build/scripts/nsis.sh
```

### Build Commands

| Command | Target | Output |
|---------|--------|--------|
| `pnpm run build` | Current platform | `dist/` |
| `pnpm run build:linux64` | Linux x64 | `dist/linux-x64/` |
| `pnpm run build:macos64` | macOS Intel | `dist/darwin-x64/` |
| `pnpm run build:macosarm64` | Apple Silicon | `dist/darwin-arm64/` |
| `pnpm run build:win64` | Windows x64 | `dist/win-x64/` |
| `pnpm run build:macosuniversal` | Universal | `dist/darwin-universal/` |

### Build Dependencies

**Required system tools:**
- **Linux**: `gcc`, `glibc` headers
- **macOS**: Xcode Command Line Tools
- **Windows**: Visual Studio Build Tools
- **All**: Node.js 18+, pnpm 8+

## 3. CI/CD Workflows

### GitHub Actions

#### `.github/workflows/ci.yml`
**Multi-platform testing and linting:**
- Node.js 18/20/22 matrix testing
- Linux/macOS/Windows build testing
- ESLint and Prettier checks
- Security scans

#### `.github/workflows/deploy.yml`
**Production deployment:**
- On merge to `main`
- Multi-platform builds (Linux/x64, macOS/Intel, Apple Silicon, Windows/x64)
- Package generation (deb, rpm, PKGBUILD, NSIS)
- Release artifact upload
- Docker image push to GitHub Container Registry

#### `.github/workflows/release.yml`
**Automated releases:**
- Semantic versioning based on conventional commits
- GitHub Release creation
- Release notes generation
- Artifacts attachment

#### `.github/workflows/pr-check.yml`
**Pull request checks:**
- TypeScript compilation
- Unit tests coverage
- Security vulnerability scans
- Code quality metrics

## 4. MCP Server Integration

### Configuration

**`libs/mcp-server/src/`** - Model Context Protocol implementation:
- **Standard MCP server** with JSON-RPC 2.0
- **6 tools** for stock analysis operations
- **Connection** to AI Agent system via REST API

**Available Tools:**

1. **get_k_line_data** - Fetch K-line data
   - Parameters: symbol, timeframe, start_date, end_date
   - Returns: Array of OHLCV data

2. **get_indicator_data** - Calculate technical indicators
   - Parameters: symbol, indicator_name, timeframe, start_date
   - Returns: Indicator values with metadata

3. **merge_k_lines** - Merge K-lines using containment relationships
   - Parameters: K-line data
   - Returns: Merged K-line structure

4. **calculate_bi** - Calculate trend lines (Bi recognition)
   - Parameters: K-line data
   - Returns: Bi with direction, start/end points

5. **detect_channels** - Detect consolidation zones (Channels)
   - Parameters: Bi data
   - Returns: Channel segments with properties

6. **get_ai_analysis** - Get AI agent analysis
   - Parameters: task_description, context_data
   - Returns: AI-generated analysis

### Setup Instructions

1. **Install MCP server:**
```bash
# Run as standalone service
pnpm run start:dev:mcp-server  # Port 8009

# Or deploy with Docker
docker-compose up mcp-server
```

2. **Connect to AI applications:**
```javascript
import { MCPClient } from '@modelcontextprotocol/client';

const client = new MCPClient({
  serverUrl: 'http://localhost:8009',
  apiKey: 'your-api-key'
});

// Use tools
const result = await client.callTool('get_k_line_data', {
  symbol: '000001',
  timeframe: 'daily',
  start_date: '2024-01-01',
  end_date: '2024-12-31'
});
```

## 5. Environment Setup

### Prerequisites

**System Requirements:**
- **Node.js 18+** (LTS recommended)
- **pnpm 8+** package manager
- **Git** for version control
- **Docker & Docker Compose** (for containerization)
- **MySQL 8.0+** (or Docker container)

**Python Environment for AKTools:**
```bash
# Create virtual environment
python3 -m venv python-env
source python-env/bin/activate  # Windows: python-env\Scripts\activate

# Install AKTools
pip install aktools

# Start data source server
python3 -m aktools
```

**Database Setup:**
```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
CREATE USER 'mist_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON mist.* TO 'mist_user'@'localhost';
FLUSH PRIVILEGES;
```

### Environment Files

**`apps/*/src/.env.example`** - Template for configuration:
```env
NODE_ENV=development
PORT=8001
DB_HOST=localhost
DB_PORT=3306
DB_USER=mist_user
DB_PASSWORD=your_password
DB_DATABASE=mist
AKTOOLS_URL=http://localhost:8080
```

**Environment Variables:**
- `NODE_ENV` - Application environment (development/production)
- `PORT` - Service-specific port
- `DB_*` - MySQL connection parameters
- `AKTOOLS_URL` - Python AKTools server URL
- `LOG_LEVEL` - Logging level (debug/info/warn/error)

## 6. Troubleshooting

### Common Issues

#### Port Conflicts
**Issue**: Service fails to start, port already in use
**Solution**:
```bash
# Find process using port
lsof -i :8001
# Kill process
kill -9 <PID>
# Or change port in .env file
```

#### AKTools Connection Issues
**Issue**: Cannot connect to AKTools at `http://localhost:8080`
**Solution**:
```bash
# Check if AKTools is running
python3 -m aktools &

# Check port availability
netstat -an | grep 8080

# Verify server response
curl http://localhost:8080/health
```

#### Docker Build Issues
**Issue**: Build fails in CI/CD but works locally
**Solution**:
```bash
# Clear Docker cache
docker system prune -a

# Build with verbose output
docker-compose build --no-cache

# Check system requirements
docker run --rm node:18-alpine node --version
```

#### TypeScript Compilation Errors
**Issue**: Build fails with TypeScript errors
**Solution**:
```bash
# Clear dist folders
rm -rf dist/ apps/*/dist/

# Rebuild dependencies
pnpm install --force

# Run TypeScript check
npx tsc --noEmit
```

#### Database Connection Issues
**Issue**: Cannot connect to MySQL database
**Solution**:
```bash
# Test MySQL connection
mysql -h localhost -u root -p

# Check database exists
SHOW DATABASES LIKE 'mist';

# Test TypeORM connection
npx typeorm migration:run --dataSource .env
```

### Performance Optimization

**Memory Usage:**
- Monitor with `top` or `htop`
- Enable production logging for debugging
- Use `NODE_OPTIONS="--max-old-space-size=4096"` for memory-heavy operations

**API Performance:**
- Use connection pooling for MySQL
- Implement caching for frequent queries
- Optimize AI agent workflows

### Support Resources

- **Documentation**: `/docs/` directory
- **GitHub Issues**: Report bugs and feature requests
- **ChatGPT/Claude**: For technical assistance
- **AKTools Community**: For data source issues

## Related Documentation

- **[CLAUDE.md](../CLAUDE.md)** - Project overview and development guidelines
- **[Talib.md](../Talib.md)** - Technical indicators documentation
- **[Roadmap.md](../Roadmap.md)** - AI agent architecture diagram
- **[Dockerfile](../docker-compose.yml)** - Container configuration
- **[package.json](../package.json)** - Build scripts and dependencies

---

*Last Updated: March 2026*