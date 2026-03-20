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
 * K-line extension entity for TongDaXin (通达信) data source
 * Contains additional fields specific to TDX data format
 */
@Entity({
  name: 'k_line_extensions_tdx',
})
export class KLineExtensionTDX {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: DataSource,
    name: 'source',
    default: DataSource.TDX,
    comment: '数据源：tdx=通达信',
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
    type: 'double',
    precision: 12,
    scale: 6,
    comment: '前复因子：用于处理复权数据',
  })
  forwardFactor: number;

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

  @Column({
    type: 'bigint',
    comment: '成交笔数',
  })
  tradeCount: bigint;

  @Column({
    type: 'double',
    precision: 12,
    scale: 4,
    comment: '涨跌幅：(收盘价-昨收)/昨收*100',
  })
  changePct: number;

  @Column({
    type: 'double',
    precision: 12,
    scale: 2,
    comment: '涨跌额：收盘价-昨收',
  })
  changeAmt: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
