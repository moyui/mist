import { FactorPluginController } from './factor-plugin.controller';

describe('FactorPluginController', () => {
  it('lists registered factor plugins', () => {
    const controller = new FactorPluginController();
    const plugins = controller.listPlugins();

    expect(plugins.length).toBeGreaterThanOrEqual(5);
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain('plugin.chan.bsp');
    expect(ids).toContain('plugin.legacy.rule-dsl');
    expect(ids).toContain('plugin.technical.volume-breakout');
    expect(ids).toContain('plugin.fundamental.safety-guard');
    expect(ids).toContain('plugin.capital.northbound');
  });

  it('filters plugins by category', () => {
    const controller = new FactorPluginController();
    const chanPlugins = controller.listPlugins('CHAN');
    expect(chanPlugins.every((p) => p.category === 'CHAN')).toBe(true);
    expect(chanPlugins.map((p) => p.id)).toContain('plugin.chan.bsp');
  });
});
