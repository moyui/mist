# Chan Application

Notification and communication module for the Mist system. Handles alerts and notifications across multiple channels.

## Features

- **Multi-Channel Support**: Send notifications through various channels
- **Alert Management**: Configure and manage stock price alerts
- **Notification Templates**: Reusable notification templates

## Prerequisites

- Node.js (v18+)
- Configuration for notification channels (email, SMS, webhook, etc.)

## Installation

```bash
# Install dependencies
pnpm install
```

## Running the Application

### Development Mode

```bash
pnpm run start:dev:chan
```

### Production Build

```bash
# Build the application
pnpm run build

# Start production server
pnpm run start:prod:chan
```

## Configuration

Notification channel configurations are managed through environment variables and config files.

## License

BSD-3-Clause
