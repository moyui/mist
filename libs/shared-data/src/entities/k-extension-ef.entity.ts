import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { K } from './k.entity';

/**
 * Market data extension entity for East Money (东方财富) data source
 * Contains additional fields specific to EF data format using independent primary key + foreign key design
 */
@Entity({
  name: 'k_extensions_ef',
})
export class KExtensionEf {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_id' })
  k!: K;

  @Column({ name: 'k_id', select: false })
  kId!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '振幅（%）',
  })
  amplitude: number | null = null;

  @Column({
    name: 'change_pct',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌幅（%）',
  })
  changePct: number | null = null;

  @Column({
    name: 'change_amt',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '涨跌额（元）',
  })
  changeAmt: number | null = null;

  @Column({
    name: 'turnover_rate',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number | null = null;

  @Column({
    name: 'volume_count',
    type: 'bigint',
    nullable: true,
    comment: '成交笔数',
  })
  volumeCount: bigint | null = null;

  @Column({
    name: 'inner_volume',
    type: 'bigint',
    nullable: true,
    comment: '内盘量',
  })
  innerVolume: bigint | null = null;

  @Column({
    name: 'outer_volume',
    type: 'bigint',
    nullable: true,
    comment: '外盘量',
  })
  outerVolume: bigint | null = null;

  @Column({
    name: 'prev_close',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '昨收价',
  })
  prevClose: number | null = null;

  @Column({
    name: 'prev_open',
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '昨开价',
  })
  prevOpen: number | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
