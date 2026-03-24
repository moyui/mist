import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Security } from './security.entity';
import { DataSource } from '../enums/data-source.enum';

@Entity({ name: 'security_source_configs' })
export class SecuritySourceConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'security_id' })
  securityId: number = 0;

  @ManyToOne(() => Security, (security) => security.sourceConfigs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'security_id' })
  security!: Security;

  @Column({
    type: 'enum',
    enum: DataSource,
    comment: '数据源：ef=东方财富，tdx=通达信，mqmt=miniQMT',
  })
  source: DataSource = DataSource.EAST_MONEY;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '数据源特定的代码格式',
  })
  formatCode: string = '';

  @Column({
    type: 'int',
    default: 0,
    comment: '优先级，数字越大越优先',
  })
  priority: number = 0;

  @Column({
    type: 'boolean',
    default: true,
    comment: '是否启用该数据源',
  })
  enabled: boolean = true;

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;
}
