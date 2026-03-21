import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Security } from './security.entity';
import { DataSource } from '../enums/data-source.enum';

@Entity({ name: 'security_source_configs' })
@Unique(['securityId', 'source'])
export class SecuritySourceConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Security, (security) => security.sourceConfigs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'security_id' })
  security: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
  })
  source: DataSource;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '数据源特定的代码格式',
  })
  formatCode: string;

  @Column({
    type: 'int',
    default: 0,
    comment: '优先级，数字越大越优先',
  })
  priority: number;

  @Column({
    type: 'boolean',
    default: true,
    comment: '是否启用该数据源',
  })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
