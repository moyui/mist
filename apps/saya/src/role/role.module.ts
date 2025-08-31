import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { TemplateModule } from '../template/template.module';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  imports: [TemplateModule, LlmModule, ConfigModule],
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
