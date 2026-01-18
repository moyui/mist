import { Column, PrimaryGeneratedColumn } from 'typeorm';
import { Table } from '../enums/table.enum';
import { TrendDirection } from '../enums/trend-direction.enum';

export class ChanIndexDaily {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'timestamp',
  })
  startTime: Date;

  @Column({
    type: 'timestamp',
  })
  endTime: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '最高',
  })
  highest: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0.0,
    comment: '最低',
  })
  lowest: number;

  @Column({
    type: 'enum',
    enum: TrendDirection,
    default: TrendDirection.None,
    comment: '趋势',
  })
  trend: TrendDirection;

  @Column({
    type: 'int',
    default: 0,
    comment: '合并数量',
  })
  mergeCount: number;

  @Column({
    type: 'enum',
    enum: Table,
    default: Table.IndexDaily,
    comment: '来源表',
  })
  dataTable: Table;

  @Column({ type: 'json', comment: '合并的原始k线id数组', nullable: true })
  mergeIds: number[];
}
