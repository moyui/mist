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

  @Index()
  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_id' })
  k!: K;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: '完整代号',
  })
  fullCode: string = '';

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '振幅（%）',
  })
  amplitude: number = 0;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌幅（%）',
  })
  changePct: number = 0;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '涨跌额（元）',
  })
  changeAmt: number = 0;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number = 0;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: '成交笔数',
  })
  volumeCount: bigint = 0n;

  @Column({
    type: 'bigint',
    nullable: true,
    comment: '内盘量',
  })
  innerVolume: bigint = 0n;

  @Column({
    type: 'decimal',
    nullable: true,
    comment: '外盘量',
  })
  outerVolume: bigint = 0n;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '昨收价',
  })
  prevClose: number = 0;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    nullable: true,
    comment: '今开价',
  })
  prevOpen: number = 0;

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;
}
