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
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌幅（%）',
  })
  changePct: number | null = null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '涨跌额（元）',
  })
  changeAmt: number | null = null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number | null = null;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: '成交笔数',
  })
  volumeCount: bigint | null = null;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: '内盘量',
  })
  innerVolume: bigint | null = null;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: '外盘量',
  })
  outerVolume: bigint | null = null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '昨收价',
  })
  prevClose: number | null = null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '昨开价',
  })
  prevOpen: number | null = null;

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;
}
