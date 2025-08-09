import { CONFIG_REGISTER } from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './agents/agents.module';
import { BuilderModule } from './builder/builder.module';
import { LlmModule } from './llm/llm.module';
import { RoleModule } from './role/role.module';
import { SayaController } from './saya.controller';
import { SayaService } from './saya.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: CONFIG_REGISTER,
    }),
    RoleModule,
    BuilderModule.register({
      nodes: [],
      edges: [],
    }),
    AgentsModule,
    LlmModule,
  ],
  controllers: [SayaController],
  providers: [SayaService],
  exports: [ConfigModule],
})
export class SayaModule {}
