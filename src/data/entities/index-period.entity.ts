import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IndexData } from './index-data.entitiy';

export enum Type {
  One = 1,
  FIVE = 5,
  FIFTEEN = 15,
  THIRTY = 30,
  SIXTY = 60,
}

@Entity({
  name: 'index_periods',
})
export class IndexPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'datetime',
    comment: '时间',
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

  // @Column({
  //   type: 'decimal',
  //   precision: 12,
  //   scale: 2,
  //   default: 0.0,
  //   comment: '振幅',
  // })
  // vibration: number;

  // @Column({
  //   type: 'double',
  //   comment: '换手率',
  // })
  // turnover_rate: number;

  @Column({
    type: 'enum',
    enum: Type,
    default: Type.FIVE,
    comment: '类型 FIVE FIFTEEN THIRTY SIXTY',
  })
  type: Type;

  @ManyToOne(() => IndexData, (indexData) => indexData.indexPeriod, {
    cascade: true,
  })
  @JoinColumn()
  indexData: IndexData;

  @CreateDateColumn()
  createTime: Date;

  @CreateDateColumn()
  updateTime: Date;
}
