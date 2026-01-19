import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PeriodType } from '../enums/index-period.enum';
import { IndexData } from './index-data.entitiy';

@Entity({
  name: 'index_periods',
})
export class IndexPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'datetime',
    comment: '时间',
    default: () => 'CURRENT_TIMESTAMP',
  })
  time: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '开盘',
  })
  open: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '收盘',
  })
  close: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '最高',
  })
  highest: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '最低',
  })
  lowest: number;

  @Column({
    type: 'bigint',
    comment: '成交量 注意单位: 手',
  })
  volume: string;

  @Column({
    type: 'double',
    comment: '成交额 注意单位: 元',
  })
  amount: number;

  @Column({
    type: 'enum',
    enum: PeriodType,
    default: PeriodType.FIVE,
    comment: '类型 FIVE FIFTEEN THIRTY SIXTY',
  })
  type: PeriodType;

  @ManyToOne(() => IndexData, (indexData) => indexData.indexPeriod, {
    cascade: true,
  })
  @JoinColumn()
  indexData: IndexData;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
