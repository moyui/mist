import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KLine } from './kline.entity';

/**
 * K-line extension entity for East Money (东方财富) data source
 * Contains additional fields specific to EF data format
 */
@Entity({
  name: 'k_line_extensions_ef',
})
export class KlineExtensionEf {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '振幅（%）',
  })
  amplitude: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌幅（%）',
  })
  changePct: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '涨跌额（元）',
  })
  changeAmt: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
