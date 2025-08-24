import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { ToolsModule } from '../tools/tools.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [LlmModule, ToolsModule, ConfigModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
