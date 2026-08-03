import { ValidationError } from '@nestjs/common';
import { flattenValidationErrors } from './http-validation-error.factory';

describe('flattenValidationErrors', () => {
  it('retains parent and nested array constraints in stable order', () => {
    const errors: ValidationError[] = [
      {
        property: 'items',
        constraints: { parentRule: 'items parent failure' },
        children: [
          {
            property: '0',
            constraints: { arrayRule: 'item failure' },
            children: [
              {
                property: 'name',
                constraints: {
                  zRule: 'name z failure',
                  aRule: 'name a failure',
                },
              },
            ],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual({
      items: ['items parent failure'],
      'items.0': ['item failure'],
      'items.0.name': ['name a failure', 'name z failure'],
    });
  });
});
