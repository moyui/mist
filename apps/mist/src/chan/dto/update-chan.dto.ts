import { PartialType } from '@nestjs/mapped-types';
import { CreateChanDto } from './create-chan.dto';

export class UpdateChanDto extends PartialType(CreateChanDto) {}
