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
import { Period } from '../enums/period.enum';
import { Table } from '../enums/table.enum';

export enum Direction {
  Up = 'up',
  Down = 'down',
}

@Entity({
  name: 'chan_bis',
})
export class ChanBi {
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
    comment: '起始分型id',
  })
  startFenxingId: number;

  @Column({
    comment: '结束分型id',
  })
  endFenxingId: number;

  @Column({
    comment: '开始k线id',
  })
  startKlineId: number;

  @Column({
    comment: '结束k线id',
  })
  endKlineId: number;

  @Column({
    comment: '是否已经完成',
  })
  completed: boolean;

  @Column({
    type: 'enum',
    enum: Direction,
    default: Direction.Up,
    comment: '笔类型: up-上升笔, down-下降笔',
  })
  direction: Direction;

  @Column({
    type: 'int',
    comment: '包含的k线数量',
  })
  count: number;

  @Column({
    type: 'json',
    comment: '元数据',
  })
  meta: any;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
