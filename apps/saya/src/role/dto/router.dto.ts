import { z } from 'zod';
import { TEAM_MEMBERS } from '@app/config';

export const Router = z.object({
  next: z
    .union([z.enum(TEAM_MEMBERS), z.literal('FINISH')])
    .describe(
      'Worker to route to next. If no workers needed, route to FINISH.',
    ),
});
