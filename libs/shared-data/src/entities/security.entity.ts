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
import { K } from './k.entity';

@Entity({ name: 'securities' })
export class Security {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: '纯代码，如 000001, 000300',
  })
  code: string = '';

  @Column({
    type: 'varchar',
    length: 100,
    comment: '证券名称',
  })
  name: string = '';

  @Column({
    type: 'enum',
    enum: SecurityType,
    comment: '证券类型：STOCK=股票，INDEX=指数',
  })
  type: SecurityType = SecurityType.STOCK;

  @Column({
    type: 'tinyint',
    default: SecurityStatus.ACTIVE,
    comment: '状态：1=正常，0=停牌，-1=退市/终止',
  })
  status: SecurityStatus = SecurityStatus.ACTIVE;

  @OneToMany(() => SecuritySourceConfig, (config) => config.security)
  sourceConfigs!: SecuritySourceConfig[];

  @OneToMany(() => K, (bar) => bar.security)
  ks!: K[];

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updateTime!: Date;
}
