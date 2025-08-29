import { CONFIG_REGISTER } from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './agents/agents.module';
import { LlmModule } from './llm/llm.module';
import { RoleModule } from './role/role.module';
import { SayaController } from './saya.controller';
import { SayaService } from './saya.service';
import { TemplateModule } from './template/template.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: CONFIG_REGISTER,
    }),
    RoleModule,
    AgentsModule,
    LlmModule,
    TemplateModule,
    ToolsModule,
  ],
  controllers: [SayaController],
  providers: [SayaService],
  exports: [ConfigModule],
})
export class SayaModule {}
