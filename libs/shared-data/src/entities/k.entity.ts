import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
  JoinColumn,
} from 'typeorm';
import { Security } from './security.entity';
import { DataSource } from '../enums/data-source.enum';
import { KPeriod } from '../enums/k-period.enum';
import { MarketDataExtensionEf } from './market-data-extension-ef.entity';
import { MarketDataExtensionTdx } from './market-data-extension-tdx.entity';
import { MarketDataExtensionMqmt } from './market-data-extension-mqmt.entity';

@Entity({ name: 'market_data_bars' })
@Unique(['securityId', 'source', 'period', 'timestamp'])
export class K {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Security, (security) => security.marketDataBars, {
    onDelete: 'CASCADE',
    eager: false,
  })
  security: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
  })
  source: DataSource;

  @Column({
    type: 'enum',
    enum: KPeriod,
    comment: 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
  })
  period: KPeriod;

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

  // OneToOne relationships to market data extension tables
  @OneToOne(() => MarketDataExtensionEf, { eager: false })
  @JoinColumn({ name: 'market_extension_ef_id' })
  marketExtensionEf: MarketDataExtensionEf;

  @OneToOne(() => MarketDataExtensionTdx, { eager: false })
  @JoinColumn({ name: 'market_extension_tdx_id' })
  marketExtensionTdx: MarketDataExtensionTdx;

  @OneToOne(() => MarketDataExtensionMqmt, { eager: false })
  @JoinColumn({ name: 'market_extension_mqmt_id' })
  marketExtensionMqmt: MarketDataExtensionMqmt;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Virtual column for securityId to support the unique constraint
  @Column({ select: false })
  securityId: number;
}
