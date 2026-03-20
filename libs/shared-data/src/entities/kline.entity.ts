import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Stock } from './stock.entity';
import { DataSource } from '../enums/data-source.enum';
import { KLinePeriod } from '../enums/kline-period.enum';

@Entity({
  name: 'k_lines',
})
export class KLine {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Stock, (stock) => stock.klines, {
    onDelete: 'CASCADE',
    eager: false,
  })
  stock: Stock;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
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
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '开盘价',
  })
  open: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '最高价',
  })
  high: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '最低价',
  })
  low: number;

  @Column({
    type: 'decimal',
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
    comment: '成交额',
  })
  amount: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
