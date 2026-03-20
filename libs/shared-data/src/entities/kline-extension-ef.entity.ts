import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { KLinePeriod } from '../enums/kline-period.enum';

/**
 * K-line extension entity for East Money (东方财富) data source
 * Contains additional fields specific to EF data format
 */
@Entity({
  name: 'k_line_extensions_ef',
})
export class KLineExtensionEF {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: DataSource,
    name: 'source',
    default: DataSource.EAST_MONEY,
    comment: '数据源：ef=东方财富',
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

  @Index()
  @Column({
    type: 'bigint',
    comment: '振幅：(最高价-最低价)/昨收*100',
  })
  amplitude: number;

  @Index()
  @Column({
    type: 'double',
    precision: 12,
    scale: 4,
    comment: '涨跌幅：(收盘价-昨收)/昨收*100',
  })
  changePct: number;

  @Index()
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '涨跌额：收盘价-昨收',
  })
  changeAmt: number;

  @Index()
  @Column({
    type: 'double',
    precision: 12,
    scale: 4,
    comment: '换手率：成交量/流通股本*100',
  })
  turnoverRate: number;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '昨收：昨天的收盘价',
  })
  prevClose: number;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '今开：今天的开盘价',
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

  @Column({
    type: 'bigint',
    comment: '成交笔数',
  })
  tradeCount: bigint;

  @Column({
    type: 'bigint',
    comment: '流通股本',
  })
  floatShare: bigint;

  @Column({
    type: 'bigint',
    comment: '总股本',
  })
  totalShare: bigint;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
