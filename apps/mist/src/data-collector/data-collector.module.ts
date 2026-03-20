import { Module } from '@nestjs/common';
import { SourceFetcher } from './interfaces/source-fetcher.interface';

@Module({})
export class DataCollectorModule {
  // The module can be extended to include specific fetcher implementations
  // when they are created in future tasks
}