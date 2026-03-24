import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { K } from './k.entity';

/**
 * Market data extension entity for miniQMT data source
 * Contains additional fields specific to MQMT data format using independent primary key + foreign key design
 */
@Entity({
  name: 'k_extensions_mqmt',
})
export class KExtensionMqmt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_id' })
  k!: K;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: '完整代号',
  })
  fullCode: string = '';

  @CreateDateColumn({ name: 'create_time' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'update_time' })
  updateTime!: Date;
}
