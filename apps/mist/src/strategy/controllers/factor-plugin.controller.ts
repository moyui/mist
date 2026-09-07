import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  factorPluginRegistry,
  type FactorCategory,
  ChanBspFactorPlugin,
  LegacyRuleDslPlugin,
  VolumeBreakoutPlugin,
  FinancialSafetyGuardPlugin,
  NorthboundCapitalPlugin,
} from '@app/strategy';
import { FactorPluginVo } from '../vo/factor-plugin.vo';

/**
 * 确保核心与示范插件在模块初始化时完成装配
 */
function ensureStandardPluginsRegistered(): void {
  const standardPlugins = [
    new ChanBspFactorPlugin(),
    new LegacyRuleDslPlugin(),
    new VolumeBreakoutPlugin(),
    new FinancialSafetyGuardPlugin(),
    new NorthboundCapitalPlugin(),
  ];

  for (const plugin of standardPlugins) {
    if (!factorPluginRegistry.has(plugin.id)) {
      factorPluginRegistry.register(plugin);
    }
  }
}

@ApiTags('factors v1')
@Controller('v1/factors')
export class FactorPluginController {
  constructor() {
    ensureStandardPluginsRegistered();
  }

  @Get('plugins')
  @ApiOkResponse({ type: [FactorPluginVo] })
  listPlugins(@Query('category') category?: FactorCategory): FactorPluginVo[] {
    ensureStandardPluginsRegistered();
    const plugins = factorPluginRegistry.listByCategory(category);

    return plugins.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      version: p.version,
      description: p.description,
      paramSchema: p.paramSchema,
    }));
  }
}
