import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

export function flattenValidationErrors(
  errors: readonly ValidationError[],
): Record<string, string[]> {
  const collected = new Map<
    string,
    Array<{ constraint: string; message: string }>
  >();

  const visit = (error: ValidationError, parentPath: string): void => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    for (const [constraint, message] of Object.entries(
      error.constraints ?? {},
    )) {
      const entries = collected.get(path) ?? [];
      entries.push({ constraint, message });
      collected.set(path, entries);
    }
    for (const child of error.children ?? []) visit(child, path);
  };

  for (const error of errors) visit(error, '');

  return Object.fromEntries(
    [...collected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, entries]) => [
        path,
        entries
          .sort((left, right) =>
            left.constraint.localeCompare(right.constraint),
          )
          .map(({ message }) => message),
      ]),
  );
}

export function createHttpValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors: flattenValidationErrors(errors),
      }),
  });
}
