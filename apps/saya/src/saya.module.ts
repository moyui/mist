import { CONFIG_REGISTER, sayaEnvSchema } from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { AgentsModule } from './agents/agents.module';
import { BuilderModule } from './builder/builder.module';
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
      envFilePath: path.join(__dirname, '.env'),
      load: CONFIG_REGISTER,
      validationSchema: sayaEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    LlmModule,
    TemplateModule,
    ToolsModule,
    BuilderModule,
    RoleModule,
    AgentsModule,
  ],
  controllers: [SayaController],
  providers: [SayaService],
  exports: [ConfigModule],
})
export class SayaModule {}
