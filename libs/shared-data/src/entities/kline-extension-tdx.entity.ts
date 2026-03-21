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
 * K-line extension entity for TongDaXin (通达信) data source
 * Contains additional fields specific to TDX data format
 */
@Entity({
  name: 'k_line_extensions_tdx',
})
export class KlineExtensionTdx {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
    comment: '前复权因子：用于处理复权数据',
  })
  forwardFactor: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
