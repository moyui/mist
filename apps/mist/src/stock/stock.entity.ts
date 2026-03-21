import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  code!: string;

  @Column({ nullable: true })
  name!: string;

  @Column()
  type!: string;

  @Column('json', { nullable: true })
  periods!: number[];

  @Column('json')
  source!: {
    type: string;
    config?: string;
  };

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
