import { Controller } from '@nestjs/common';
import { IndicatorService } from './indicator.service';

@Controller('indicator')
export class IndicatorController {
  constructor(private readonly indicatorService: IndicatorService) {}
}
