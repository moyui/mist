import type { FactorCategory, FactorPlugin } from './factor.types';

export interface FactorPluginRegistry {
  /** 注册插件 */
  register(plugin: FactorPlugin): void;

  /** 根据 ID 获取插件 */
  get(pluginId: string): FactorPlugin | undefined;

  /** 按分类列出所有已注册插件（不传则返回全部） */
  listByCategory(category?: FactorCategory): readonly FactorPlugin[];

  /** 检查插件是否存在 */
  has(pluginId: string): boolean;

  /** 清空注册表（主要用于单元测试隔离） */
  clear(): void;
}

export class InMemoryFactorPluginRegistry implements FactorPluginRegistry {
  private readonly plugins = new Map<string, FactorPlugin>();

  public register(plugin: FactorPlugin): void {
    if (!plugin || !plugin.id) {
      throw new Error('FactorPlugin must have a valid non-empty id');
    }
    this.plugins.set(plugin.id, plugin);
  }

  public get(pluginId: string): FactorPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  public listByCategory(category?: FactorCategory): readonly FactorPlugin[] {
    const all = Array.from(this.plugins.values());
    if (!category) {
      return all;
    }
    return all.filter((p) => p.category === category);
  }

  public has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  public clear(): void {
    this.plugins.clear();
  }
}

/** 全局默认单例注册表 */
export const factorPluginRegistry: FactorPluginRegistry =
  new InMemoryFactorPluginRegistry();
