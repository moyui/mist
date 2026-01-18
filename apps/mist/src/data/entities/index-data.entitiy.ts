import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { IndexPeriod } from './index-period.entity';
import { IndexDaily } from './index-daily.entity';

export enum Type {
  'LARGE' = 1,
  'MIDDLE' = 2,
  'SMALL' = 3,
}

@Entity({
  name: 'index_datas',
})
@Unique(['id', 'symbol'])
export class IndexData {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 50,
    comment: '指数编号',
  })
  symbol: string;

  @Column({
    length: 50,
    comment: '指数名',
  })
  name: string;

  @Column({
    length: 50,
    comment: '交易所编号 sz: 深交所, sh: 上交所, csi: 中证指数 + id',
  })
  code: string;

  @Column({
    type: 'enum',
    enum: Type,
    default: Type.LARGE,
    comment: '指数类型 1-大盘股 2-中盘股 3-小盘股',
  })
  type: Type;

  @OneToMany(() => IndexPeriod, (indexPeriod) => indexPeriod.indexData)
  indexPeriod: IndexPeriod[];

  @OneToMany(() => IndexDaily, (indexDaily) => indexDaily.indexData)
  indexDaily: IndexDaily[];

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
