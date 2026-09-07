import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FactorPluginVo {
  @ApiProperty({
    description: '因子插件唯一标识，如 plugin.technical.volume-breakout',
  })
  id!: string;

  @ApiProperty({ description: '因子插件显示名称' })
  name!: string;

  @ApiProperty({ description: '所属流派分类' })
  category!: string;

  @ApiProperty({ description: '插件版本号' })
  version!: string;

  @ApiProperty({ description: '因子功能与决策逻辑描述' })
  description!: string;

  @ApiPropertyOptional({
    description: '可配置参数模型 Schema',
    type: 'object',
    additionalProperties: true,
  })
  paramSchema?: Record<string, unknown>;
}
