import { Security } from '@app/shared-data';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Period } from '../enums/period.enum';
import { Table } from '../enums/table.enum';

/**
 * Metadata type for ChanIndexPeriod entity
 * Can be extended with specific properties as needed
 */
export interface ChanIndexPeriodMeta {
  klineCount?: number;
  processedAt?: Date;
  [key: string]: unknown;
}

@Entity({
  name: 'chan_index_periods',
})
export class ChanIndexPeriod {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Security)
  @JoinColumn()
  security!: Security;

  @Column({
    type: 'enum',
    enum: Period,
    default: Period.FIVE,
    comment: '周期',
  })
  period: Period = Period.FIVE;

  @Column({
    type: 'enum',
    enum: Table,
    default: Table.IndexDaily,
    comment: '来源表',
  })
  dataTable: Table = Table.IndexDaily;

  @Column({
    comment: '开始k线id',
    default: 0,
  })
  startKlineId: number = 0;

  @Column({
    comment: '结束k线id',
    default: 0,
  })
  endKlineId: number = 0;

  @Column({
    comment: '是否已经完成',
    default: false,
  })
  completed: boolean = false;

  @Column({
    type: 'json',
    default: () => ({}),
    comment: '元数据',
  })
  meta: ChanIndexPeriodMeta = {};

  @CreateDateColumn()
  createTime!: Date;

  @UpdateDateColumn()
  updateTime!: Date;
}
