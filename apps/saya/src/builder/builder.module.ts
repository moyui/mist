import { Module } from '@nestjs/common';
import { RoleModule } from '../role/role.module';
import { BuilderController } from './builder.controller';
import { BuilderService } from './builder.service';
// import { WorkflowConfig } from './dto/workflow.dto';

@Module({
  imports: [RoleModule],
  controllers: [BuilderController],
  providers: [BuilderService],
})
export class BuilderModule {}
