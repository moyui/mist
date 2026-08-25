import { DataSource, SecurityStatus, SecurityType } from '@app/shared-data';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeSubscriptionAssignment } from '@app/shared-data';
import { Repository } from 'typeorm';
import { RealtimeSecurityAllowlistService } from './realtime-security-allowlist.service';

function repositoryReturning(
  rows: Array<{ formatCode: string; securityId: number }>,
) {
  const builder = {
    select: jest.fn(),
    addSelect: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  for (const method of [
    'select',
    'addSelect',
    'innerJoin',
    'where',
    'andWhere',
    'orderBy',
  ] as const) {
    builder[method].mockReturnValue(builder);
  }
  return {
    repository: {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as unknown as Repository<RealtimeSubscriptionAssignment>,
    builder,
  };
}

describe('RealtimeSecurityAllowlistService', () => {
  it('loads assigned entries from DB assignments (declarative authority)', async () => {
    const { repository, builder } = repositoryReturning([
      { formatCode: '600030.SH', securityId: 7 },
      { formatCode: '300502.SZ', securityId: 8 },
    ]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({}),
      repository,
    );

    await service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');

    expect(service.isAuthorized(DataSource.TDX, '600030.SH')).toBe(true);
    expect(service.isAuthorized(DataSource.TDX, '600030.sh')).toBe(false);
    expect(service.resolve(DataSource.TDX, '300502.SZ')).toEqual({
      formatCode: '300502.SZ',
      securityId: 8,
    });
    expect(builder.where).toHaveBeenCalledWith('security.type IN (:...types)', {
      types: [SecurityType.STOCK, SecurityType.INDEX],
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'source_config.source = :source',
      { source: DataSource.TDX },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'source_config.enabled = :enabled',
      { enabled: true },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('security.status = :status', {
      status: SecurityStatus.ACTIVE,
    });
  });

  it('refreshAssignedFromDb replaces the assigned set (external DB writes picked up)', async () => {
    const { repository } = repositoryReturning([
      { formatCode: '600030.SH', securityId: 7 },
    ]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({}),
      repository,
    );
    await service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');
    expect(service.assignedCountFor(DataSource.TDX)).toBe(1);

    // external write: symbol removed from DB assignments
    repositoryReturning([]);
    (repository.createQueryBuilder as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    });

    await service.refreshAssignedFromDb(DataSource.TDX);
    expect(service.assignedCountFor(DataSource.TDX)).toBe(0);
    expect(service.isAuthorized(DataSource.TDX, '600030.SH')).toBe(false);
  });

  it('resolves env allowlist from memory in mock mode without a database lookup', async () => {
    process.env.MIST_MOCK_MODE = 'true';
    try {
      const { repository } = repositoryReturning([]);
      const service = new RealtimeSecurityAllowlistService(
        new ConfigService({ TDX_REALTIME_ALLOWLIST: '600519.SH' }),
        repository,
      );

      await service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');

      expect(service.isAuthorized(DataSource.TDX, '600519.SH')).toBe(true);
      expect(service.isAuthorized(DataSource.TDX, '600519.sh')).toBe(false);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      expect(service.resolve(DataSource.TDX, '600519.SH')).toEqual({
        formatCode: '600519.SH',
        securityId: 1,
      });
    } finally {
      delete process.env.MIST_MOCK_MODE;
    }
  });

  it('keeps the allowlist empty in mock mode when env is unset', async () => {
    process.env.MIST_MOCK_MODE = 'true';
    try {
      const { repository } = repositoryReturning([]);
      const service = new RealtimeSecurityAllowlistService(
        new ConfigService({ TDX_REALTIME_ALLOWLIST: '' }),
        repository,
      );

      await service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');

      expect(service.isAuthorized(DataSource.TDX, '600519.SH')).toBe(false);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    } finally {
      delete process.env.MIST_MOCK_MODE;
    }
  });

  it('fails closed for duplicate mock env formatCodes', async () => {
    const { repository } = repositoryReturning([]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({ QMT_REALTIME_ALLOWLIST: '300502.SZ,300502.SZ' }),
      repository,
    );
    process.env.MIST_MOCK_MODE = 'true';
    try {
      await expect(
        service.initialize(DataSource.QMT, 'QMT_REALTIME_ALLOWLIST'),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      delete process.env.MIST_MOCK_MODE;
    }
  });

  it('separates assigned control from effective ingress', async () => {
    const { repository } = repositoryReturning([]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({}),
      repository,
    );

    await service.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');
    expect(service.list(DataSource.TDX)).toEqual([]);

    service.replaceAssigned(DataSource.TDX, [
      { formatCode: '600030.SH', securityId: 7 },
      { formatCode: '300502.SZ', securityId: 8 },
    ]);
    expect(service.resolve(DataSource.TDX, '300502.SZ')).toEqual({
      formatCode: '300502.SZ',
      securityId: 8,
    });
    expect(service.resolveEffective(DataSource.TDX, '300502.SZ')).toBeNull();

    service.replaceEffective(DataSource.TDX, ['600030.SH', 'UNASSIGNED.SH']);
    expect(service.list(DataSource.TDX)).toEqual([
      { formatCode: '600030.SH', securityId: 7 },
    ]);
    expect(service.resolveEffective(DataSource.TDX, '300502.SZ')).toBeNull();

    expect(service.replaceEffective(DataSource.TDX, [])).toEqual([
      { formatCode: '600030.SH', securityId: 7 },
    ]);
  });

  it('rejects one provider symbol mapped to different assigned securities', () => {
    const { repository } = repositoryReturning([]);
    const service = new RealtimeSecurityAllowlistService(
      new ConfigService({}),
      repository,
    );
    expect(() =>
      service.replaceAssigned(DataSource.QMT, [
        { formatCode: '300502.SZ', securityId: 7 },
        { formatCode: '300502.SZ', securityId: 8 },
      ]),
    ).toThrow(BadRequestException);
  });
});
