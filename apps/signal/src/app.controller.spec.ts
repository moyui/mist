import { AppController } from './app.controller';

describe('AppController (signal)', () => {
  let controller: AppController;

  beforeEach(() => {
    controller = new AppController();
  });

  it('should return hello greeting', () => {
    expect(controller.getHello()).toBe('Hello World!');
  });
});
