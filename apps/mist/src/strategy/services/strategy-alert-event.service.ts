import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyAlertEvent, StrategyAlertStatus } from '@app/shared-data';
import { FindOptionsWhere, Repository } from 'typeorm';
import { MarkStrategyAlertDeliveryDto } from '../dto/mark-strategy-alert-delivery.dto';
import { QueryStrategyAlertEventDto } from '../dto/query-strategy-alert-event.dto';

@Injectable()
export class StrategyAlertEventService {
  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEventRepository: Repository<StrategyAlertEvent>,
  ) {}

  async findAll(
    query: QueryStrategyAlertEventDto,
  ): Promise<StrategyAlertEvent[]> {
    const where: FindOptionsWhere<StrategyAlertEvent> = {};

    if (query.status !== undefined) where.status = query.status;
    if (query.strategySignalId) {
      where.strategySignalId = Number(query.strategySignalId);
    }

    return await this.alertEventRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async markDelivered(
    id: number,
    dto: MarkStrategyAlertDeliveryDto,
  ): Promise<StrategyAlertEvent> {
    const event = await this.findEventOrThrow(id);

    event.status = StrategyAlertStatus.DELIVERED;
    event.deliveryResult = dto.deliveryResult ?? null;
    return await this.alertEventRepository.save(event);
  }

  async markFailed(
    id: number,
    dto: MarkStrategyAlertDeliveryDto,
  ): Promise<StrategyAlertEvent> {
    const event = await this.findEventOrThrow(id);

    event.status = StrategyAlertStatus.FAILED;
    event.deliveryResult = dto.deliveryResult ?? null;
    return await this.alertEventRepository.save(event);
  }

  async acknowledge(id: number): Promise<StrategyAlertEvent> {
    const event = await this.findEventOrThrow(id);

    event.status = StrategyAlertStatus.ACKED;
    event.acknowledgedAt = new Date();
    return await this.alertEventRepository.save(event);
  }

  private async findEventOrThrow(id: number): Promise<StrategyAlertEvent> {
    const event = await this.alertEventRepository.findOne({ where: { id } });

    if (!event) {
      throw new NotFoundException(`Strategy alert event ${id} not found`);
    }

    return event;
  }
}
