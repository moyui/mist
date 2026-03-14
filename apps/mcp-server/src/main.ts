import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { McpServerModule } from './mcp-server.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  await NestFactory.createApplicationContext(McpServerModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const port = process.env.PORT ?? 8009;
  logger.log(`MCP Server is running on port ${port}`);
}
bootstrap();
