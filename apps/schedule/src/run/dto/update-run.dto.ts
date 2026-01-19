import { PartialType } from '@nestjs/mapped-types';
import { CreateRunDto } from './create-run.dto';

export class UpdateRunDto extends PartialType(CreateRunDto) {}
