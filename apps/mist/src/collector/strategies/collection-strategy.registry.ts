import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';
import { IDataCollectionStrategy } from './data-collection.strategy.interface';

export const COLLECTION_STRATEGIES = Symbol('COLLECTION_STRATEGIES');

@Injectable()
export class CollectionStrategyRegistry {
  private readonly strategies = new Map<DataSource, IDataCollectionStrategy>();

  constructor(
    private readonly dataSourceService: DataSourceService,
    @Inject(COLLECTION_STRATEGIES)
    private readonly strategyList: IDataCollectionStrategy[],
  ) {
    for (const strategy of strategyList) {
      this.strategies.set(strategy.source, strategy);
    }
  }

  resolve(source?: DataSource): IDataCollectionStrategy {
    const resolved = source ?? this.dataSourceService.getDefault();
    const strategy = this.strategies.get(resolved);
    if (!strategy) {
      throw new BadRequestException(
        `No collection strategy found for data source: ${resolved}`,
      );
    }
    return strategy;
  }
}
