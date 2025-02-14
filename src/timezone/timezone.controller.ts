import { Controller } from '@nestjs/common';
import { TimezoneService } from './timezone.service';
@Controller('timezone')
export class TimezoneController {
  constructor(private readonly timezoneService: TimezoneService) {}
}
