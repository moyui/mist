import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('realtime candle sink boundary', () => {
  it('does not import strategy execution or TypeORM persistence into the candle path', () => {
    const files = [
      join(
        process.cwd(),
        'apps/mist/src/realtime/realtime-snapshot-ingress.service.ts',
      ),
      ...walk(join(process.cwd(), 'apps/mist/src/realtime/candle')).filter(
        (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'),
      ),
    ];
    const source = files.map((path) => readFileSync(path, 'utf8')).join('\n');

    for (const token of [
      '@nestjs/typeorm',
      "from 'typeorm'",
      'InjectRepository',
      'Repository<',
      'EntityManager',
      'StrategyScanService',
      'AlertEvent',
    ]) {
      expect(source).not.toContain(token);
    }
    expect(source).not.toMatch(/from ['"][^'"]*\/strategy\//);
  });
});

function walk(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
