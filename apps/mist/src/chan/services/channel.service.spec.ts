import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  describe('基础功能', () => {
    it('service should be defined', () => {
      expect(service).toBeDefined();
    });
  });
});
