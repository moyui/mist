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
 * Market data extension entity for TongDaXin (通达信) data source
 * Contains additional fields specific to TDX data format using independent primary key + foreign key design
 */
@Entity({
  name: 'k_extensions_tdx',
})
export class KExtensionTdx {
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
    precision: 16,
    scale: 8,
    nullable: true,
    comment: '前复权因子：用于处理复权数据',
  })
  forwardFactor: number = 0;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 8,
    nullable: true,
    comment: '后复权因子：用于处理复权数据',
  })
  backwardFactor: number = 0;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '成交量比',
  })
  volumeRatio: number = 0;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '换手率（%）',
  })
  turnoverRate: number = 0;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '换手金额',
  })
  turnoverAmount: number = 0;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '总市值',
  })
  totalMarketValue: number = 0;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    comment: '流通市值',
  })
  floatMarketValue: number = 0;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '每股收益',
  })
  earningsPerShare: number = 0;

  @Column({
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    comment: '市盈率',
  })
  priceEarningsRatio: number = 0;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
    comment: '市净率',
  })
  priceToBookRatio: number = 0;

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;
}
