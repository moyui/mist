import type { ChannelMessage } from '../channels/channel-adapter.port';
import type { OoAlertJobV1 } from './oo-alert.constants';

/** Build a channel-neutral message from an OO health-alert job. */
export function buildInfraEnvelope(job: OoAlertJobV1): ChannelMessage {
  const source = job.source ? ` source=${job.source}` : '';
  return {
    text: `[Mist 告警][${job.severity}] ${job.alertName}${source}\n${job.summary}\n${job.ts}`,
  };
}
