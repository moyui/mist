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
import { KExtensionEf } from './k-extension-ef.entity';
import { KExtensionTdx } from './k-extension-tdx.entity';
import { KExtensionMqmt } from './k-extension-mqmt.entity';

@Entity({ name: 'market_data_bars' })
@Unique(['securityId', 'source', 'period', 'timestamp'])
export class K {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Security, (security) => security.ks, {
    onDelete: 'CASCADE',
    eager: false,
  })
  security!: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
  })
  source: DataSource = DataSource.EAST_MONEY;

  @Column({
    type: 'enum',
    enum: KPeriod,
    comment: 'K线周期：1min, 5min, 15min, 30min, 60min, daily等',
  })
  period: KPeriod = KPeriod.DAILY;

  @Column({
    type: 'datetime',
    comment: 'K线时间戳',
  })
  timestamp: Date = new Date();

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '开盘价',
  })
  open: number = 0;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '最高价',
  })
  high: number = 0;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '最低价',
  })
  low: number = 0;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    comment: '收盘价',
  })
  close: number = 0;

  @Column({
    type: 'bigint',
    comment: '成交量',
  })
  volume: bigint = 0n;

  @Column({
    type: 'double',
    comment: '成交额',
  })
  amount: number = 0;

  // OneToOne relationships to market data extension tables
  @OneToOne(() => KExtensionEf, { eager: false })
  @JoinColumn({ name: 'market_extension_ef_id' })
  marketExtensionEf!: KExtensionEf;

  @OneToOne(() => KExtensionTdx, { eager: false })
  @JoinColumn({ name: 'market_extension_tdx_id' })
  marketExtensionTdx!: KExtensionTdx;

  @OneToOne(() => KExtensionMqmt, { eager: false })
  @JoinColumn({ name: 'market_extension_mqmt_id' })
  marketExtensionMqmt!: KExtensionMqmt;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Virtual column for securityId to support the unique constraint
  @Column({ select: false })
  securityId: number = 0;
}
