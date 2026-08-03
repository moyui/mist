import { ApiProperty } from '@nestjs/swagger';

export class KVo {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  symbol!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  time!: Date;
  @ApiProperty({ type: String, nullable: true })
  amount!: string | null;
  @ApiProperty()
  open!: number;
  @ApiProperty()
  close!: number;
  @ApiProperty()
  high!: number;
  @ApiProperty()
  low!: number;
}
