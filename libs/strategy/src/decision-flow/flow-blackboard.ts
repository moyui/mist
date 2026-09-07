/**
 * 共享黑板 (FlowBlackBoard)
 * 在单次求值生命周期内为决策树各节点提供特征共享与上下文富化能力。
 * 控制流是树，数据流是黑板。
 */
export class FlowBlackboard {
  private readonly store: Map<string, unknown>;

  constructor(
    initialAttributes?: Map<string, unknown> | Record<string, unknown>,
  ) {
    if (initialAttributes instanceof Map) {
      this.store = new Map(initialAttributes);
    } else if (initialAttributes && typeof initialAttributes === 'object') {
      this.store = new Map(Object.entries(initialAttributes));
    } else {
      this.store = new Map();
    }
  }

  public get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  public set(key: string, value: unknown): this {
    this.store.set(key, value);
    return this;
  }

  public has(key: string): boolean {
    return this.store.has(key);
  }

  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  public get size(): number {
    return this.store.size;
  }

  /**
   * 获取底层原始 Map，以便与 FactorContext.attributes 无缝互通
   */
  public toMap(): Map<string, unknown> {
    return this.store;
  }

  /**
   * 将黑板内容序列化为纯 JSON 对象，用于存储与持久化追踪
   */
  public toJSON(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.store.entries()) {
      obj[key] = value;
    }
    return obj;
  }
}
