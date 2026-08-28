import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { VisualCommand } from '@app/visual-command';

export class VisualCommandVo {
  @ApiProperty({ description: '指令唯一ID' })
  id: string;

  @ApiProperty({
    description: '指令类型: line | band | text | icon',
    example: 'line',
  })
  type: string;

  @ApiProperty({ description: '所属图层', example: 'chan_bi' })
  layer: string;

  @ApiPropertyOptional({ description: '起始K线索引' })
  startIndex?: number;

  @ApiPropertyOptional({ description: '结束K线索引' })
  endIndex?: number;

  @ApiPropertyOptional({ description: '起始时间' })
  startTime?: string;

  @ApiPropertyOptional({ description: '结束时间' })
  endTime?: string;

  @ApiPropertyOptional({ description: '起始价格' })
  startPrice?: number;

  @ApiPropertyOptional({ description: '结束价格' })
  endPrice?: number;

  @ApiPropertyOptional({ description: '区间上轨' })
  top?: number;

  @ApiPropertyOptional({ description: '区间下轨' })
  bottom?: number;

  @ApiPropertyOptional({ description: '起始索引（band）' })
  fromIndex?: number;

  @ApiPropertyOptional({ description: '结束索引（band）' })
  toIndex?: number;

  @ApiPropertyOptional({ description: '起始时间（band）' })
  fromTime?: string;

  @ApiPropertyOptional({ description: '结束时间（band）' })
  toTime?: string;

  @ApiPropertyOptional({ description: '极值高点 gg' })
  gg?: number;

  @ApiPropertyOptional({ description: '极值低点 dd' })
  dd?: number;

  @ApiPropertyOptional({ description: '是否填充（band）' })
  fill?: boolean;

  @ApiPropertyOptional({ description: '线宽（line）' })
  width?: number;

  @ApiPropertyOptional({ description: '线型 solid|dashed|dotted' })
  style?: string;

  @ApiPropertyOptional({
    description: '图标形态 arrow_up|arrow_down|dot|square',
  })
  shape?: string;

  @ApiPropertyOptional({ description: '文本或标记位置' })
  index?: number;

  @ApiPropertyOptional({ description: '价格' })
  price?: number;

  @ApiPropertyOptional({ description: '标注文字' })
  text?: string;

  @ApiPropertyOptional({ description: '颜色十六进制或名称' })
  color?: string;

  @ApiPropertyOptional({ description: '文本位置 above|below' })
  position?: string;
}

export class VisualCommandPayloadVo {
  @ApiProperty({ description: '证券代码', example: '000001' })
  code: string;

  @ApiProperty({ description: '周期（分钟数）', example: 5 })
  period: number;

  @ApiProperty({ description: '数据源', example: 'qmt' })
  source: string;

  @ApiProperty({ description: '总K线根数', example: 500 })
  totalKlines: number;

  @ApiProperty({ description: '绘图指令列表', type: [VisualCommandVo] })
  commands: readonly VisualCommand[];
}
