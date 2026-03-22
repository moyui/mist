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
 * Metadata type for ChanBi entity
 * Can be extended with specific properties as needed
 */
export interface ChanBiMeta {
  klines?: number[];
  highestPrice?: number;
  lowestPrice?: number;
  [key: string]: unknown;
}

export enum Direction {
  Up = 'up',
  Down = 'down',
}

@Entity({
  name: 'chan_bis',
})
export class ChanBi {
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
    type: 'int',
    default: 0,
    comment: '起始分型id',
  })
  startFenxingId: number = 0;

  @Column({
    type: 'int',
    default: 0,
    comment: '结束分型id',
  })
  endFenxingId: number = 0;

  @Column({
    type: 'int',
    default: 0,
    comment: '开始k线id',
  })
  startKlineId: number = 0;

  @Column({
    type: 'int',
    default: 0,
    comment: '结束k线id',
  })
  endKlineId: number = 0;

  @Column({
    type: 'boolean',
    default: false,
    comment: '是否已经完成',
  })
  completed: boolean = false;

  @Column({
    type: 'enum',
    enum: Direction,
    default: Direction.Up,
    comment: '笔类型: up-上升笔, down-下降笔',
  })
  direction: Direction = Direction.Up;

  @Column({
    type: 'int',
    default: 0,
    comment: '包含的k线数量',
  })
  count: number = 0;

  @Column({
    type: 'json',
    default: () => ({}),
    comment: '元数据',
  })
  meta: ChanBiMeta = {};

  @CreateDateColumn()
  createTime!: Date;

  @UpdateDateColumn()
  updateTime!: Date;
}
