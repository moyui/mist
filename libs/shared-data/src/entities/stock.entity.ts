import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockStatus } from '../enums/stock-status.enum';

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

  // Relationships to be added in Tasks 4 and 5
  // TODO: Add @OneToMany relationship with StockSourceFormat in Task 4
  // TODO: Add @OneToMany relationship with KLine in Task 5

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime: Date;
}
