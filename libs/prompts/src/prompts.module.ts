import { Module } from '@nestjs/common';
import { PromptsService } from './prompts.service';

@Module({
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
