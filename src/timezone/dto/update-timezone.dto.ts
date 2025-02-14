import { PartialType } from '@nestjs/mapped-types';
import { CreateTimezoneDto } from './create-timezone.dto';

export class UpdateTimezoneDto extends PartialType(CreateTimezoneDto) {}
