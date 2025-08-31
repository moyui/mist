import { UtilsModule } from '@app/utils';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({
  imports: [HttpModule, UtilsModule],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
