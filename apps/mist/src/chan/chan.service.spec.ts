import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES } from '@app/constants';
import { ChanService } from './chan.service';

describe('ChanService HTTP boundary', () => {
  const service = new ChanService();

  it('preserves the existing empty-channel HTTP rejection', () => {
    let error: unknown;

    try {
      service.createChannels({ k: [] });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((error as HttpException).getResponse()).toBe(
      ERROR_MESSAGES.BI_ARRAY_EMPTY,
    );
  });
});
