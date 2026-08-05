import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { KExtensionEf } from './k-extension-ef.entity';
import { KExtensionQmt } from './k-extension-qmt.entity';
import { canonicalDecimalTransformer } from '../transformers/canonical-decimal.transformer';
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
  @JoinColumn({ name: 'security_id' })
  security!: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，qmt=大QMT',
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
  open: number = Number.NaN;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '最高价',
  })
  high: number = Number.NaN;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '最低价',
  })
  low: number = Number.NaN;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    comment: '收盘价',
  })
  close: number = Number.NaN;

  @Column({
    type: 'decimal',
    precision: 36,
    scale: 8,
    nullable: true,
    transformer: canonicalDecimalTransformer,
    comment: '成交量',
  })
  volume: string | null = null;

  @Column({
    type: 'decimal',
    precision: 36,
    scale: 8,
    nullable: true,
    transformer: canonicalDecimalTransformer,
    comment: '成交额',
  })
  amount: string | null = null;

  // OneToOne relationships to market data extension tables
  @OneToOne(() => KExtensionEf, { eager: false })
  kExtensionEf!: KExtensionEf;

  @OneToOne(() => KExtensionTdx, { eager: false })
  kExtensionTdx!: KExtensionTdx;

  @OneToOne(() => KExtensionQmt, { eager: false })
  kExtensionQmt!: KExtensionQmt;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Explicit FK column aligned with the @JoinColumn above. Declared here so the
  // entity exposes securityId as a plain column (used by unique constraint and
  // by consumers that read k.securityId without loading the relation).
  @Column({ name: 'security_id' })
  securityId: number = 0;
}
