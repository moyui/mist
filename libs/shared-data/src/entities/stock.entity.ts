import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockStatus } from '../enums/stock-status.enum';
import { StockSourceFormat } from './stock-source-format.entity';
import { KLine } from './kline.entity';

@Entity({
  name: 'stocks',
})
export class Stock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: '纯股票代码，如 000001, 600000',
  })
  code: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '股票名称',
  })
  name: string;

  @Column({
    type: 'tinyint',
    default: StockStatus.NORMAL,
    comment: '状态：1=正常 0=停牌 -1=退市',
  })
  status: StockStatus;

  @OneToMany(() => StockSourceFormat, (format) => format.stock)
  sourceFormats: StockSourceFormat[];

  @OneToMany(() => KLine, (kline) => kline.stock)
  klines: KLine[];

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime: Date;
}
