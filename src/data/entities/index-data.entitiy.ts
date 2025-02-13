import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IndexPeriod } from './index-period.entity';

export enum Type {
  'LARGE' = 1,
  'MIDDLE' = 2,
  'SMALL' = 3,
}

@Entity({
  name: 'index_datas',
})
export class IndexData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 50,
    comment: '指数名',
  })
  name: string;

  @Column({
    length: 50,
    comment: '指数编号',
  })
  symbol: string;

  @Column({
    type: 'enum',
    enum: Type,
    default: Type.LARGE,
    comment: '指数类型 1-大盘股 2-中盘股 3-小盘股',
  })
  type: Type;

  @OneToMany(() => IndexPeriod, (indexPeriod) => indexPeriod.indexData)
  indexPeriod: IndexPeriod[];

  @CreateDateColumn()
  createTime: Date;

  @CreateDateColumn()
  updateTime: Date;
}
