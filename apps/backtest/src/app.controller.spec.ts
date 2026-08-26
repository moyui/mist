import { AppController } from './app.controller';

describe('AppController (backtest)', () => {
  let controller: AppController;

  beforeEach(() => {
    controller = new AppController();
  });

  it('should return hello greeting', () => {
    expect(controller.getHello()).toBe('Hello World!');
  });
});
