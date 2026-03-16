import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';

describe('ChannelService (Performance)', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });
});
