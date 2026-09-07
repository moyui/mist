import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategySignal } from '@app/shared-data';
import { FindOptionsWhere, Repository } from 'typeorm';
import { QueryStrategySignalDto } from '../dto/query-strategy-signal.dto';

@Injectable()
export class StrategySignalService {
  constructor(
    @InjectRepository(StrategySignal)
    private readonly signalRepository: Repository<StrategySignal>,
  ) {}

  async findAll(query: QueryStrategySignalDto): Promise<StrategySignal[]> {
    const where: FindOptionsWhere<StrategySignal> = {};

    if (query.strategyDefinitionId) {
      where.strategyDefinitionId = Number(query.strategyDefinitionId);
    }
    if (query.securityId) where.securityId = Number(query.securityId);
    if (query.period !== undefined) where.period = query.period;
    if (query.source !== undefined) where.source = query.source;

    return await this.signalRepository.find({
      where,
      relations: ['security'],
      order: { signalTime: 'DESC' },
    });
  }
}
