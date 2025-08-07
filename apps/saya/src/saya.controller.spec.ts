import { Test, TestingModule } from '@nestjs/testing';
import { SayaController } from './saya.controller';
import { SayaService } from './saya.service';

describe('SayaController', () => {
  let sayaController: SayaController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SayaController],
      providers: [SayaService],
    }).compile();

    sayaController = app.get<SayaController>(SayaController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(sayaController.getHello()).toBe('Hello World!');
    });
  });
});
