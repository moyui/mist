import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { K } from './k.entity';

/**
 * Market data extension entity for miniQMT data source
 * Contains additional fields specific to MQMT data format using independent primary key + foreign key design
 */
@Entity({
  name: 'market_data_extensions_mqmt',
})
export class KExtensionMqmt {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bar_id' })
  bar: K;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'VWAP（成交量加权平均价）',
  })
  vwap: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Ichimoku转换线',
  })
  tenkanSen: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Ichimoku基准线',
  })
  kijunSen: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Ichimoku先行线A',
  })
  senkouSpanA: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Ichimoku先行线B',
  })
  senkouSpanB: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Ichimoku滞后线',
  })
  chikouSpan: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '布林带上轨',
  })
  bollingerUpper: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '布林带中轨',
  })
  bollingerMiddle: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '布林带下轨',
  })
  bollingerLower: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    comment: 'ATR（平均真实范围）',
  })
  atr: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: '动能指标',
  })
  momentum: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: 'MACD快线',
  })
  macdFast: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: 'MACD慢线',
  })
  macdSlow: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: 'MACD柱状图',
  })
  macdHistogram: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
