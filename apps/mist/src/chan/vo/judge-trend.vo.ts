import { TrendDirection } from '../enums/trend-direction.enum';

export class JudgeTrendVo {
  trend!: TrendDirection;
  confidence!: number;
}
