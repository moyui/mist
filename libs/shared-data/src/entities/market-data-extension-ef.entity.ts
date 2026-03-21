import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MarketDataBar } from './market-data-bar.entity';

/**
 * Market data extension entity for East Money (东方财富) data source
 * Contains additional fields specific to EF data format using independent primary key + foreign key design
 */
@Entity({
  name: 'market_data_extensions_ef',
})
export class MarketDataExtensionEf {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => MarketDataBar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bar_id' })
  bar: MarketDataBar;

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

  @Column({
    type: 'bigint',
    nullable: true,
    comment: '成交笔数',
  })
  volumeCount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '内盘量',
  })
  innerVolume: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    comment: '外盘量',
  })
  outerVolume: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '昨收价',
  })
  prevClose: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '今开价',
  })
  prevOpen: number;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
