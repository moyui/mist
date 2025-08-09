import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [LlmModule, ConfigModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
