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
 * Market data extension entity for TongDaXin (通达信) data source
 * Contains additional fields specific to TDX data format using independent primary key + foreign key design
 */
@Entity({
  name: 'market_data_extensions_tdx',
})
export class KExtensionTdx {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bar_id' })
  bar: K;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
    comment: '前复权因子：用于处理复权数据',
  })
  forwardFactor: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
    comment: '后复权因子：用于处理复权数据',
  })
  backwardFactor: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '成交量比',
  })
  volumeRatio: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '换手金额',
  })
  turnoverAmount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '总市值',
  })
  totalMarketValue: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '流通市值',
  })
  floatMarketValue: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '每股收益',
  })
  earningsPerShare: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    comment: '市盈率',
  })
  priceEarningsRatio: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    comment: '市净率',
  })
  priceToBookRatio: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
