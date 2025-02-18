import { Type as IndexPeriodType } from '../entities/index-period.entity';

export class IndexPeriodPriceVo {
  symbol: string;
  time: Date;
  price: number;
  period: IndexPeriodType;
}
