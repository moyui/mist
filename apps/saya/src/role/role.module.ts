import { Module } from '@nestjs/common';
import { TemplateModule } from '../template/template.module';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  imports: [TemplateModule],
  controllers: [RoleController],
  providers: [RoleService],
})
export class RoleModule {}
