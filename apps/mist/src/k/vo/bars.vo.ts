import { ApiProperty } from '@nestjs/swagger';

export class BarsVo {
  @ApiProperty({ description: 'Bar ID' })
  id: number;

  @ApiProperty({ description: 'Highest price' })
  highest: number;

  @ApiProperty({ description: 'Lowest price' })
  lowest: number;

  @ApiProperty({ description: 'Open price' })
  open: number;

  @ApiProperty({ description: 'Close price' })
  close: number;

  @ApiProperty({ description: 'Symbol code' })
  symbol: string;

  @ApiProperty({ description: 'Timestamp' })
  timestamp: Date;

  @ApiProperty({ description: 'Amount' })
  amount: number;
}
