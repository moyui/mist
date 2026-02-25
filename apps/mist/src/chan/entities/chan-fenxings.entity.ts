import { IndexData } from '@app/shared-data';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FenxingType } from '../enums/fenxing.enum';
import { Period } from '../enums/period.enum';
import { Table } from '../enums/table.enum';

/**
 * Metadata type for ChanFenxings entity
 * Can be extended with specific properties as needed
 */
export interface ChanFenxingMeta {
  klineCount?: number;
  processedAt?: Date;
  [key: string]: unknown;
}

@Entity({
  name: 'chan_fenxings',
})
export class ChanFenxings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => IndexData)
  @JoinColumn()
  indexData: IndexData;

  @Column({
    type: 'enum',
    enum: Period,
    default: Period.FIVE,
    comment: '周期',
  })
  period: Period;

  @Column({
    type: 'enum',
    enum: Table,
    default: Table.IndexDaily,
    comment: '来源表',
  })
  dataTable: Table;

  @Column({
    comment: '开始k线id',
  })
  startKlineId: number;

  @Column({
    comment: '结束k线id',
  })
  endKlineId: number;

  @Column({
    type: 'enum',
    enum: FenxingType,
    default: FenxingType.Top,
    comment: '类型',
  })
  type: FenxingType;

  @Column({
    comment: '是否已经完成',
  })
  completed: boolean;

  @Column({
    type: 'json',
    comment: '元数据',
  })
  meta: ChanFenxingMeta;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
