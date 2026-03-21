import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SecurityType } from '../enums/security-type.enum';
import { SecurityStatus } from '../enums/security-status.enum';
import { SecuritySourceConfig } from './security-source-config.entity';
import { MarketDataBar } from './market-data-bar.entity';

@Entity({ name: 'securities' })
export class Security {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: '纯代码，如 000001, 000300',
  })
  code: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '证券名称',
  })
  name: string;

  @Column({
    type: 'enum',
    enum: SecurityType,
    comment: '证券类型：STOCK=股票，INDEX=指数',
  })
  type: SecurityType;

  @Column({
    type: 'varchar',
    length: 10,
    comment: '交易所：SH=上交所，SZ=深交所，CSI=中证指数',
  })
  exchange: string;

  @Column({
    type: 'tinyint',
    default: SecurityStatus.ACTIVE,
    comment: '状态：1=正常，0=停牌，-1=退市/终止',
  })
  status: SecurityStatus;

  @OneToMany(() => SecuritySourceConfig, (config) => config.security)
  sourceConfigs: SecuritySourceConfig[];

  @OneToMany(() => MarketDataBar, (bar) => bar.security)
  marketDataBars: MarketDataBar[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
