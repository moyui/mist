import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestRun } from './backtest-run.entity';

@Entity({ name: 'backtest_signal_results' })
@Index(
  'uq_backtest_signal_results_run_security_time',
  ['backtestRunId', 'securityCode', 'signalTime'],
  { unique: true },
)
@Index('idx_backtest_signal_results_run_time_id', [
  'backtestRunId',
  'signalTime',
  'id',
])
export class BacktestSignalResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @ManyToOne(() => BacktestRun, (run) => run.signalResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'backtest_run_id' })
  backtestRun!: BacktestRun;

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

  @Column({ name: 'signal_time', type: 'datetime' })
  signalTime: Date = new Date();

  @Column({ name: 'context_snapshot', type: 'json' })
  contextSnapshot!: Record<string, unknown>;

  @Column({ name: 'rule_snapshot', type: 'json' })
  ruleSnapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
