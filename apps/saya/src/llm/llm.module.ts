import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';

@Module({
  imports: [ConfigModule],
  controllers: [LlmController],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
