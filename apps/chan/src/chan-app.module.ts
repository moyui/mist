import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { chanEnvSchema } from '@app/config';
import { ChanModule } from '../../mist/src/chan/chan.module';
import { TrendModule } from '../../mist/src/trend/trend.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: chanEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ChanModule,
    TrendModule,
  ],
})
export class ChanAppModule {}
