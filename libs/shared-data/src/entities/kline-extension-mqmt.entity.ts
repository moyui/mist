import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { KLinePeriod } from '../enums/kline-period.enum';

/**
 * K-line extension entity for miniQMT data source
 * Placeholder entity for future MQMT-specific fields
 */
@Entity({
  name: 'k_line_extensions_mqmt',
})
export class KLineExtensionMQMT {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: DataSource,
    name: 'source',
    default: DataSource.MINI_QMT,
    comment: '数据源：mqmt=miniQMT',
  })
  source: DataSource;

  @Column({
    type: 'enum',
    enum: KLinePeriod,
    comment: 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
  })
  period: KLinePeriod;

  @Column({
    type: 'datetime',
    comment: 'K线时间戳',
  })
  timestamp: Date;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '开盘价',
  })
  open: number;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '最高价',
  })
  high: number;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '最低价',
  })
  low: number;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '收盘价',
  })
  close: number;

  @Column({
    type: 'bigint',
    comment: '成交量',
  })
  volume: bigint;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '成交额',
  })
  amount: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;

  @Column({
    type: 'json',
    comment: 'Additional MQMT-specific metadata (placeholder for future use)',
    nullable: true,
  })
  metadata: Record<string, any>;
}
