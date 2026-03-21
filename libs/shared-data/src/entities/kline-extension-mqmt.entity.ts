import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KLine } from './kline.entity';

/**
 * K-line extension entity for miniQMT data source
 * Placeholder entity for future MQMT-specific fields
 */
@Entity({
  name: 'k_line_extensions_mqmt',
})
export class KlineExtensionMqmt {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => KLine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_line_id' })
  kline: KLine;

  // TODO: 待补充 miniQMT 特有字段

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
