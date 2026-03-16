import { Test, TestingModule } from '@nestjs/testing';
import { BuilderController } from './builder.controller';
import { BuilderService } from './builder.service';
import { RoleService } from '../role/role.service';

describe('BuilderController', () => {
  let controller: BuilderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BuilderController],
      providers: [
        BuilderService,
        {
          provide: RoleService,
          useValue: {
            Commander: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get<BuilderController>(BuilderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
