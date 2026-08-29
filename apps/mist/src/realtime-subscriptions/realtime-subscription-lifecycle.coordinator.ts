import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  RealtimeSubscriptionAssignment,
  SecurityStatus,
  SecurityType,
} from '@app/shared-data';
import { Repository } from 'typeorm';
import {
  ASIA_SHANGHAI_TIMEZONE,
  CRON_SUBSCRIPTION_RESET_0915,
  isIntradayAddWindow,
} from '@app/timezone';
import { Clock } from '../realtime/clock.service';
import { RealtimeSecurityAllowlistService } from '../realtime/realtime-security-allowlist.service';
import { RealtimeSnapshotIngressService } from '../realtime/realtime-snapshot-ingress.service';
import { SubscriptionControlResult } from '../realtime/realtime-subscription-control';
import {
  REALTIME_SUBSCRIPTION_SOURCES,
  RealtimeSubscriptionSource,
} from './realtime-subscription.constants';
import {
  RealtimeSubscriptionReadyObservation,
  RealtimeSubscriptionRuntimeRegistry,
} from './realtime-subscription-runtime.registry';
import {
  RealtimeLifecycleTrigger,
  RealtimeSubscriptionLifecycleObservationStore,
} from './realtime-subscription-lifecycle-observation.store';
import { RuntimeConfigService } from './runtime-config.service';

const RECONCILIATION_DEADLINE_MS = 35_000;
const SHUTDOWN_WAIT_MS = 1_000;
const RECONCILE_INTERVAL_DEFAULT_MS = 60_000;

interface SourceRoundState {
  running: Promise<void> | null;
  dirty: boolean;
  pendingPolicy: ReconciliationPolicy | null;
  pendingTrigger: RealtimeLifecycleTrigger | null;
  latestConnectionId: number | null;
}

type ReconciliationPolicy = 'incremental' | 'reset';

interface AssignedRoute {
  securityId: number;
  providerSymbol: string;
  securityStatus: SecurityStatus;
}

/** Unique owner of production subscription reconciliation in apps/mist. */
@Injectable()
export class RealtimeSubscriptionLifecycleCoordinator
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    RealtimeSubscriptionLifecycleCoordinator.name,
  );
  private readonly states = new Map<
    RealtimeSubscriptionSource,
    SourceRoundState
  >([
    [
      DataSource.TDX,
      {
        running: null,
        dirty: false,
        pendingPolicy: null,
        pendingTrigger: null,
        latestConnectionId: null,
      },
    ],
    [
      DataSource.QMT,
      {
        running: null,
        dirty: false,
        pendingPolicy: null,
        pendingTrigger: null,
        latestConnectionId: null,
      },
    ],
  ]);
  private unsubscribeReady: (() => void) | null = null;
  private unsubscribeDisconnected: (() => void) | null = null;
  private shuttingDown = false;

  constructor(
    @InjectRepository(RealtimeSubscriptionAssignment)
    private readonly assignmentRepository: Repository<RealtimeSubscriptionAssignment>,
    private readonly config: ConfigService,
    private readonly runtime: RealtimeSubscriptionRuntimeRegistry,
    private readonly clock: Clock,
    private readonly observations: RealtimeSubscriptionLifecycleObservationStore,
    private readonly allowlist: RealtimeSecurityAllowlistService,
    private readonly ingress: RealtimeSnapshotIngressService,
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    // Refresh the switch cache BEFORE mounting event subscriptions so the
    // first accepted_ready (usually within seconds of startup) is gated by
    // the real value, not the bootstrap default.
    await this.runtimeConfig.refresh();
    // Event subscriptions are always mounted (no mode gate): the
    // auto_reconcile switch is evaluated at each trigger, so a started-off
    // instance recovers when the switch flips to true.
    this.unsubscribeReady = this.runtime.subscribeReady((observation) => {
      this.handleAcceptedReady(observation);
    });
    this.unsubscribeDisconnected = this.runtime.subscribeDisconnected(
      (source) => {
        this.observations.disconnect(source);
        this.applyEffectiveInventory(source, []);
      },
    );
    const intervalMs = Number(
      this.config.get('REALTIME_RECONCILE_INTERVAL_MS') ??
        RECONCILE_INTERVAL_DEFAULT_MS,
    );
    const interval = setInterval(
      () => void this.runScheduledReconciliation(),
      intervalMs,
    );
    this.scheduler.addInterval('realtime-subscription-reconcile', interval);
  }

  /** Called only after the owning database transaction commits. */
  requestIncrementalReconciliation(source: RealtimeSubscriptionSource): void {
    if (!this.autoReconcile() || !isIntradayAddWindow(this.clock.nowDate())) {
      return;
    }
    this.enqueue(source, 'incremental', 'intraday_activation');
  }

  /** Refreshes authoritative database-derived desired state without provider I/O. */
  async refreshDesiredState(source: RealtimeSubscriptionSource): Promise<void> {
    try {
      const routes = await this.readAssignedRoutes(source);
      this.applyAssignedRoutes(source, routes);
    } catch {
      this.logger.warn(
        `Realtime subscription desired refresh failed source=${source}`,
      );
    }
  }

  @Cron(CRON_SUBSCRIPTION_RESET_0915, {
    name: 'realtime-subscription-weekday-0915-reset',
    timeZone: ASIA_SHANGHAI_TIMEZONE,
  })
  runWeekday0915Barrier(): void {
    if (this.shuttingDown || !this.autoReconcile()) return;
    for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
      this.enqueue(source, 'reset', 'weekday_0915');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    try {
      this.scheduler.deleteInterval('realtime-subscription-reconcile');
    } catch {
      // interval was never registered (e.g. module init failed)
    }
    this.unsubscribeReady?.();
    this.unsubscribeReady = null;
    this.unsubscribeDisconnected?.();
    this.unsubscribeDisconnected = null;
    for (const state of this.states.values()) {
      state.dirty = false;
      state.pendingPolicy = null;
      state.pendingTrigger = null;
    }
    const running = [...this.states.values()]
      .map((state) => state.running)
      .filter((round): round is Promise<void> => round !== null);
    if (running.length === 0) return;
    await Promise.race([
      Promise.allSettled(running),
      new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS)),
    ]);
  }

  /**
   * Declarative convergence (pure declaration, no HTTP control endpoint):
   * every scheduled round refreshes the auto_reconcile switch from the DB;
   * when true, each source is reconciled with the reset policy (full
   * syncSubscriptions alignment), so external assignment writes (add or
   * remove) take effect within one interval without a restart. When the
   * switch flips false→true, one immediate full alignment is triggered;
   * true→false just stops further rounds (existing subscriptions are kept —
   * manual takeover semantics).
   */
  private async runScheduledReconciliation(): Promise<void> {
    if (this.shuttingDown) return;
    const before = this.runtimeConfig.getAutoReconcileCached();
    await this.runtimeConfig.refresh();
    const after = this.runtimeConfig.getAutoReconcileCached();
    if (!after) return;
    if (!before && after) {
      this.logger.log('auto_reconcile enabled: triggering full alignment');
      for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
        this.enqueue(source, 'reset', 'auto_reconcile_enabled');
      }
      return;
    }
    for (const source of REALTIME_SUBSCRIPTION_SOURCES) {
      this.enqueue(source, 'reset', 'scheduled_reconcile');
    }
  }

  private handleAcceptedReady(
    observation: RealtimeSubscriptionReadyObservation,
  ): void {
    if (this.shuttingDown) return;
    const state = this.states.get(observation.source);
    if (!state) return;
    // Track the connection unconditionally so a later auto_reconcile flip
    // (false→true) can converge immediately instead of waiting for a new
    // reconnect; only the convergence enqueue is gated.
    state.latestConnectionId = observation.connectionId;
    if (!this.autoReconcile()) return;
    this.enqueue(observation.source, 'reset', 'accepted_ready');
  }

  /** Auto-reconcile gate: false = manual management (no automatic
   * convergence; existing subscriptions are kept). */
  private autoReconcile(): boolean {
    return this.runtimeConfig.getAutoReconcileCached();
  }

  private enqueue(
    source: RealtimeSubscriptionSource,
    policy: ReconciliationPolicy,
    trigger: RealtimeLifecycleTrigger,
  ): void {
    if (this.shuttingDown) return;
    const state = this.states.get(source);
    if (!state) return;
    const stronger = strongerPolicy(state.pendingPolicy, policy);
    if (stronger !== state.pendingPolicy || state.pendingTrigger === null) {
      state.pendingTrigger = trigger;
    }
    state.pendingPolicy = stronger;
    if (state.running) {
      state.dirty = true;
      return;
    }
    this.startRound(source, state);
  }

  private startRound(
    source: RealtimeSubscriptionSource,
    state: SourceRoundState,
  ): void {
    const connectionId = state.latestConnectionId;
    const policy = state.pendingPolicy;
    const trigger = state.pendingTrigger;
    state.pendingPolicy = null;
    state.pendingTrigger = null;
    if (
      connectionId === null ||
      policy === null ||
      trigger === null ||
      this.shuttingDown
    ) {
      return;
    }
    state.dirty = false;
    this.observations.begin(source, trigger, this.clock.nowDate());
    const running = this.runReconciliation(source, connectionId, policy)
      .catch((error: unknown) => {
        const reason = stableFailureReason(error);
        this.observations.fail(source, reason);
        if (reason === 'QMT_JOURNAL_RECONCILIATION_REQUIRED') {
          this.logger.debug(
            `Realtime subscription reconciliation failed source=${source} reason=${reason}`,
          );
        } else {
          this.logger.warn(
            `Realtime subscription reconciliation failed source=${source} reason=${reason}`,
          );
        }
      })
      .finally(() => {
        if (state.running !== running) return;
        state.running = null;
        if (state.dirty && !this.shuttingDown) {
          this.startRound(source, state);
        }
      });
    state.running = running;
  }

  private async runReconciliation(
    source: RealtimeSubscriptionSource,
    connectionId: number,
    policy: ReconciliationPolicy,
  ): Promise<void> {
    const deadline = Date.now() + RECONCILIATION_DEADLINE_MS;
    const routes = await this.readAssignedRoutes(source);
    this.applyAssignedRoutes(source, routes);
    const desired = routes
      .filter((route) => route.securityStatus === SecurityStatus.ACTIVE)
      .map((route) => route.providerSymbol);
    const before = await this.executeOnConnection(
      source,
      connectionId,
      deadline,
      (control) => control.getSubscriptions(),
    );
    const active = decodeActiveSymbols(source, before);
    this.observations.replaceActive(source, active);
    this.applyEffectiveInventory(source, active);
    if (policy === 'reset') {
      await this.executeOnConnection(
        source,
        connectionId,
        deadline,
        (control) => control.syncSubscriptions(desired),
      );
    } else {
      const activeSet = new Set(active);
      for (const symbol of desired) {
        if (activeSet.has(symbol)) continue;
        await this.executeOnConnection(
          source,
          connectionId,
          deadline,
          (control) => control.subscribe(symbol),
        );
      }
    }
    const after = await this.executeOnConnection(
      source,
      connectionId,
      deadline,
      (control) => control.getSubscriptions(),
    );
    const finalActive = decodeActiveSymbols(source, after);
    this.observations.replaceActive(source, finalActive);
    this.applyEffectiveInventory(source, finalActive);
    this.observations.succeed(source, this.clock.nowDate());
  }

  private async executeOnConnection(
    source: RealtimeSubscriptionSource,
    connectionId: number,
    deadline: number,
    operation: (
      control: NonNullable<
        ReturnType<RealtimeSubscriptionRuntimeRegistry['getReadyControl']>
      >,
    ) => Promise<SubscriptionControlResult>,
  ): Promise<SubscriptionControlResult> {
    if (this.shuttingDown) {
      throw new Error('REALTIME_SUBSCRIPTION_SHUTTING_DOWN');
    }
    const control = this.runtime.getReadyControl(source, connectionId);
    if (!control) throw new Error('REALTIME_SUBSCRIPTION_CONNECTION_STALE');
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error('REALTIME_SUBSCRIPTION_RECONCILIATION_DEADLINE');
    }
    const result = await withDeadline(operation(control), remainingMs);
    if ('failure' in result) throw new Error(result.failure.reason);
    return result;
  }

  private async readAssignedRoutes(
    source: RealtimeSubscriptionSource,
  ): Promise<AssignedRoute[]> {
    const rows = await this.assignmentRepository
      .createQueryBuilder('assignment')
      .select('source_config.formatCode', 'providerSymbol')
      .addSelect('security.id', 'securityId')
      .addSelect('security.status', 'securityStatus')
      .innerJoin('assignment.security', 'security')
      .innerJoin('assignment.sourceConfig', 'source_config')
      .where('security.type IN (:...types)', {
        types: [SecurityType.STOCK, SecurityType.INDEX],
      })
      .andWhere('source_config.source = :source', { source })
      .andWhere('source_config.enabled = :enabled', { enabled: true })
      .orderBy('source_config.formatCode', 'ASC')
      .getRawMany<AssignedRoute>();
    return rows;
  }

  private applyEffectiveInventory(
    source: RealtimeSubscriptionSource,
    activeSymbols: readonly string[],
  ): void {
    const removed = this.allowlist.replaceEffective(source, activeSymbols);
    for (const entry of removed) {
      this.ingress.removeSeries(entry.securityId, source);
    }
  }

  private applyAssignedRoutes(
    source: RealtimeSubscriptionSource,
    routes: readonly AssignedRoute[],
  ): void {
    this.allowlist.replaceAssigned(
      source,
      routes.map((route) => ({
        securityId: route.securityId,
        formatCode: route.providerSymbol,
      })),
    );
    this.observations.setDesired(
      source,
      routes
        .filter((route) => route.securityStatus === SecurityStatus.ACTIVE)
        .map((route) => route.providerSymbol),
    );
  }
}

function strongerPolicy(
  current: ReconciliationPolicy | null,
  incoming: ReconciliationPolicy,
): ReconciliationPolicy {
  return current === 'reset' || incoming === 'reset' ? 'reset' : 'incremental';
}

function decodeActiveSymbols(
  source: RealtimeSubscriptionSource,
  result: SubscriptionControlResult,
): string[] {
  if (!('success' in result)) throw new Error(result.failure.reason);
  const value = result.success;
  if (source === DataSource.TDX) {
    if (!Array.isArray(value) || !value.every(isProviderSymbol)) {
      throw new Error('TDX_SUBSCRIPTION_READBACK_INVALID');
    }
    return [...new Set(value)].sort();
  }
  if (!isRecord(value) || !hasExactKeys(value, ['whole', 'singles'])) {
    throw new Error('QMT_SUBSCRIPTION_READBACK_INVALID');
  }
  const whole = value['whole'];
  const singles = value['singles'];
  if (
    !isRecord(singles) ||
    !Object.keys(singles).every(isProviderSymbol) ||
    !Object.values(singles).every(Number.isInteger)
  ) {
    throw new Error('QMT_SUBSCRIPTION_READBACK_INVALID');
  }
  const symbols = Object.keys(singles);
  if (whole !== null) {
    if (
      !isRecord(whole) ||
      !hasExactKeys(whole, ['subId', 'symbols']) ||
      !Number.isInteger(whole['subId']) ||
      !Array.isArray(whole['symbols']) ||
      !whole['symbols'].every(isProviderSymbol)
    ) {
      throw new Error('QMT_SUBSCRIPTION_READBACK_INVALID');
    }
    symbols.push(...whole['symbols']);
  }
  return [...new Set(symbols)].sort();
}

function isProviderSymbol(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(?:\d{6}\.(?:SH|SZ|BJ)|\d{5,6}\.HK)$/.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

export { isIntradayAddWindow };

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error('REALTIME_SUBSCRIPTION_RECONCILIATION_DEADLINE')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stableFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (/^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return 'unknown';
}
