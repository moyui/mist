import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IndexData } from './index-data.entitiy';

@Entity({
  name: 'index_dailys',
})
export class IndexDaily {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 50,
    comment: '时间, 数据源开始记录的时候，不是指数上市的时候',
  })
  time: string;

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

  @ManyToOne(() => IndexData, (indexData) => indexData.indexPeriod, {
    cascade: true,
  })
  indexData: IndexData;

  @CreateDateColumn()
  createTime: Date;

  @CreateDateColumn()
  updateTime: Date;
}
