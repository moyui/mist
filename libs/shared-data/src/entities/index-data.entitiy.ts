import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DataType } from '../enums/index-data.enum';
import { IndexDaily } from './index-daily.entity';
import { IndexPeriod } from './index-period.entity';

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
    enum: DataType,
    default: DataType.LARGE,
    comment: '指数类型 1-大盘股 2-中盘股 3-小盘股',
  })
  type: DataType;

  @OneToMany(() => IndexPeriod, (indexPeriod) => indexPeriod.indexData)
  indexPeriod: IndexPeriod[];

  @OneToMany(() => IndexDaily, (indexDaily) => indexDaily.indexData)
  indexDaily: IndexDaily[];

  @CreateDateColumn()
  createTime: Date;

  @UpdateDateColumn()
  updateTime: Date;
}
