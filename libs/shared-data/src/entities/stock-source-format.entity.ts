import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Stock } from './stock.entity';

@Entity({
  name: 'stock_source_formats',
})
@Unique(['stock', 'source'])
export class StockSourceFormat {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_id' })
  stock: Stock;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '数据源标识：ef/tdx/mqmt',
  })
  source: DataSource;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '该数据源的完整格式代码，如 sz000001, 000001.SH',
  })
  formattedCode: string;

  @CreateDateColumn({ name: 'create_time' })
  createTime: Date;
}
