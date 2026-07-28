import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  decodeRealtimeNativeMapMessage,
  parseRealtimeMessage,
} from './realtime-native-map.decoder';

describe('schema-v2 canonical golden', () => {
  const fixturePath = resolve(
    __dirname,
    '../../../../test/fixtures/realtime/realtime-native-frame-v2.json',
  );
  const checksumPath = fixturePath.replace(/\.json$/, '.sha256');

  it('matches its sidecar and decodes every formal case', () => {
    const raw = readFileSync(fixturePath);
    const expected = readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0];
    expect(createHash('sha256').update(raw).digest('hex')).toBe(expected);

    const fixture = JSON.parse(raw.toString('utf8')) as {
      contract: { schemaVersion: number };
      cases: Record<string, unknown>;
    };
    expect(fixture.contract.schemaVersion).toBe(2);
    expect(
      decodeRealtimeNativeMapMessage(
        parseRealtimeMessage(JSON.stringify(fixture.cases.tdxOneEntry)),
        'tdx',
      ).data.schemaVersion,
    ).toBe(2);
    expect(
      Object.keys(
        decodeRealtimeNativeMapMessage(
          parseRealtimeMessage(JSON.stringify(fixture.cases.qmtMultiEntry)),
          'qmt',
        ).data.native,
      ),
    ).toEqual(['300502.SZ', '000001.SZ']);
  });
});
