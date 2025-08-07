import { Module } from '@nestjs/common';
import { SayaController } from './saya.controller';
import { SayaService } from './saya.service';

@Module({
  imports: [],
  controllers: [SayaController],
  providers: [SayaService],
})
export class SayaModule {}
