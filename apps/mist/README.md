# Mist Application

Main stock market analysis application for the Mist system. Provides technical indicators, Chan Theory analysis, and trend detection for the Shanghai Stock Exchange.

## Features

- **Technical Indicators**: MACD, RSI, KDJ, ADX, ATR calculations
- **Chan Theory Analysis**: Bi (笔), Fenxing (分型), and Channel (中枢) detection
- **Trend Analysis**: Market trend direction detection
- **Data Management**: Historical data storage and retrieval for multiple timeframes

## Prerequisites

- Node.js (v18+)
- MySQL database
- Redis (optional, for caching)
- AKTools local server for stock data (see [AKTools Setup](#aktools-setup))

## Installation

```bash
# Install dependencies
pnpm install
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp src/.env.example src/.env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `mysql_server_host` | MySQL host | localhost |
| `mysql_server_port` | MySQL port | 3306 |
| `mysql_server_username` | MySQL username | root |
| `mysql_server_password` | MySQL password | your_secure_password |
| `mysql_server_database` | Database name | mist |
| `nest_server_port` | Application port | 3000 |
| `redis_server_host` | Redis host | localhost |
| `redis_server_port` | Redis port | 6379 |
| `redis_server_db` | Redis database number | 1 |

## Database Setup

Create the MySQL database:

```sql
CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;
```

Tables will be auto-created on first run (development mode only).

## AKTools Setup

AKTools is required for fetching stock market data.

```bash
# Create Python virtual environment
python3 -m venv python-env

# Activate the environment
source python-env/bin/activate  # On Windows: python-env\Scripts\activate

# Install AKTools
python3 -m pip install aktools

# Start AKTools server
python3 -m aktools
```

AKTools will start on `http://localhost:8080` by default.

## Running the Application

### Development Mode

```bash
pnpm run start:dev:mist
```

The application will be available at `http://localhost:8001`

### Production Build

```bash
# Build the application
pnpm run build

# Start production server
pnpm run start:prod:mist
```

## API Documentation

Once running, access the Swagger documentation at:

```
http://localhost:8001/api-docs
```

## API Endpoints

### Health Check
- `GET /app/hello` - Service health check

### Chan Theory Analysis
- `POST /chan/merge-k` - Merge K-lines based on containment
- `POST /chan/bi` - Create Bi (strokes) from K-lines
- `POST /chan/channel` - Create channels (Zhongshu) from Bi

### Technical Indicators
- `POST /indicator/macd` - Calculate MACD indicator
- `POST /indicator/rsi` - Calculate RSI indicator
- `POST /indicator/kdj` - Calculate KDJ indicator
- `POST /indicator/k` - Get K-line data

## Time Periods

Data is stored for multiple timeframes:
- 1min, 5min, 15min, 30min, 60min, daily

## Troubleshooting

### TypeORM Synchronize Disabled

In production, `synchronize: false` is set for safety. Use migrations:

```bash
# Generate migration
pnpm run migration:generate -- -n MigrationName

# Run migration
pnpm run migration:run
```

### AKTools Connection Issues

If AKTools fails silently:
1. Check if port 8080 is available: `lsof -i :8080`
2. Verify AKTools is running: `curl http://localhost:8080/health`
3. Check AKTools logs for errors

## License

BSD-3-Clause
