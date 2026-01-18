import { Controller } from '@nestjs/common';
import { ChanService } from './chan.service';

@Controller('chan')
export class ChanController {
  constructor(private readonly chanService: ChanService) {}
}
