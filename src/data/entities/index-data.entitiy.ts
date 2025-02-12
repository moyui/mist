import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({
  name: 'indexs',
})
export class Index {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 50,
    comment: '指数名',
  })
  name: string;

  @Column({
    length: 50,
    comment: '指数编号',
  })
  symbol: string;

  @Column({
    comment: '指数类型 1-大盘股 2-中盘股 3-小盘股',
  })
  type: number;

  @CreateDateColumn()
  createTime: Date;

  @CreateDateColumn()
  updateTime: Date;
}
