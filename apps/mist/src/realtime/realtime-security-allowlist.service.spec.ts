import {
  DataSource,
  SecuritySourceConfig,
  SecurityType,
} from '@app/shared-data';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RealtimeSecurityAllowlistService } from './realtime-security-allowlist.service';

function repositoryReturning(
  rows: Array<{
    formatCode: string;
    securityId: number;
    securityType: SecurityType;
  }>,
) {
  const builder = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    select: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  for (const method of ['innerJoin', 'where', 'andWhere', 'select'] as const) {
    builder[method].mockReturnValue(builder);
  }
  return {
    repository: {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as unknown as Repository<SecuritySourceConfig>,
    builder,
  };
}

describe('RealtimeSecurityAllowlistService', () => {
  it('binds a source-specific exact formatCode to one active security identity', async () => {
    const { repository, builder } = repositoryReturning([
      {
        formatCode: '600030.SH',
        securityId: 7,
        securityType: SecurityType.STOCK,
      },
    ]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({ TDX_REALTIME_ALLOWLIST: '600030.SH' }),
      repository,
    );

    await service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');

    expect(service.isAuthorized(DataSource.TDX, '600030.SH')).toBe(true);
    expect(service.isAuthorized(DataSource.TDX, '600030.sh')).toBe(false);
    expect(builder.andWhere).toHaveBeenCalledWith(
      'BINARY cfg.format_code = :formatCode',
      { formatCode: '600030.SH' },
    );
  });

  it('rejects a non-stock before provider quantity conversion', async () => {
    const { repository } = repositoryReturning([
      {
        formatCode: '000300.SH',
        securityId: 8,
        securityType: SecurityType.INDEX,
      },
    ]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({ TDX_REALTIME_ALLOWLIST: '000300.SH' }),
      repository,
    );

    await expect(
      service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST'),
    ).rejects.toThrow(/support STOCK only/);
  });

  it('fails closed for duplicate requested formatCodes', async () => {
    const { repository } = repositoryReturning([]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({ QMT_REALTIME_ALLOWLIST: '300502.SZ,300502.SZ' }),
      repository,
    );

    await expect(
      service.initialize(DataSource.QMT, 'QMT_REALTIME_ALLOWLIST'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
