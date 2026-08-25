/**
 * Canonical Cron Expressions for A-share Trading Pipeline (Asia/Shanghai).
 *
 * Use these constants in @Cron decorators across apps to ensure single-source-of-truth
 * schedule definitions.
 */

/** 09:05 Asia/Shanghai on exchange trading days (Monday - Friday). Pre-market automated health inspection. */
export const CRON_PRE_MARKET_INSPECTION_0905 = '0 5 9 * * 1-5';

/** 09:15 Asia/Shanghai on exchange trading days (Monday - Friday). Subscription lifecycle Read-Before-Reset barrier. */
export const CRON_SUBSCRIPTION_RESET_0915 = '0 15 9 * * 1-5';

/** 22:30 Asia/Shanghai on exchange trading days (Monday - Friday). Nightly primary post-close market data sync. */
export const CRON_POST_CLOSE_SYNC_NIGHTLY_2230 = '30 22 * * 1-5';

/** 06:30 Asia/Shanghai on following mornings (Tuesday - Saturday). Morning fallback retry post-close sync for previous trading day. */
export const CRON_POST_CLOSE_SYNC_MORNING_0630 = '30 6 * * 2-6';
