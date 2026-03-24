import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { KExtensionEf } from './k-extension-ef.entity';
import { KExtensionMqmt } from './k-extension-mqmt.entity';
import { KExtensionTdx } from './k-extension-tdx.entity';
import { Security } from './security.entity';

@Entity({ name: 'k' })
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
    enum: Period,
    comment:
      'K线周期：1, 5, 15, 30, 60, 1440 (day), 10080 (week), 43200 (month)',
  })
  period: Period = Period.DAY;

  @Column({
    type: 'datetime',
    comment: 'K线时间戳',
  })
  timestamp: Date = new Date();

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '开盘价',
  })
  open: number = 0;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '最高价',
  })
  high: number = 0;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '最低价',
  })
  low: number = 0;

  @Column({
    type: 'decimal',
    precision: 20,
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
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '成交额',
  })
  amount: number = 0;

  // OneToOne relationships to market data extension tables
  @OneToOne(() => KExtensionEf, { eager: false })
  kExtensionEf!: KExtensionEf;

  @OneToOne(() => KExtensionTdx, { eager: false })
  kExtensionTdx!: KExtensionTdx;

  @OneToOne(() => KExtensionMqmt, { eager: false })
  kExtensionMqmt!: KExtensionMqmt;

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;

  // Virtual column for securityId to support the unique constraint
  @Column({ select: false })
  securityId: number = 0;
}
