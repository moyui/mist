import { IndexData } from '@app/shared-data';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Table } from '../enums/table.enum';

/**
 * Metadata type for ChanState entity
 * Can be extended with specific properties as needed
 */
export interface ChanStateMeta {
  lastProcessedAt?: Date;
  [key: string]: unknown;
}

@Entity({
  name: 'chan_states',
})
export class ChanState {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => IndexData)
  @JoinColumn()
  indexData: IndexData;

  @Column({
    type: 'enum',
    enum: Table,
    default: Table.IndexDaily,
    comment: '来源表',
  })
  dataTable: Table;

  @Column({
    comment: '最后数据id',
  })
  lastDataId: number;

  @Column({
    comment: '最后笔id',
  })
  lastBiId: number;

  @Column({
    comment: '最后分型id',
  })
  lastFenxingId: number;

  @Column({
    type: 'json',
    comment: '元数据',
  })
  meta: ChanStateMeta;

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
