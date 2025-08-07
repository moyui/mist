import { PartialType } from '@nestjs/mapped-types';
import { CreateGraphDto } from './create-graph.dto';

export class UpdateGraphDto extends PartialType(CreateGraphDto) {}
