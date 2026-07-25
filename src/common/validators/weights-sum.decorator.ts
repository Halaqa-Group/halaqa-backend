import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

/**
 * Validates that the listed sibling numeric fields sum to `total` (± 0.001).
 * Attach to any single property of the DTO; the validator reads the whole object.
 * Non-numeric siblings are skipped so per-field @IsNumber() reports those instead.
 */
export function WeightsSumTo(
  total: number,
  fields: string[],
  options?: ValidationOptions,
) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'weightsSumTo',
      target: object.constructor,
      propertyName,
      constraints: [total, fields],
      options,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const [sum, keys] = args.constraints as [number, string[]];
          const obj = args.object as Record<string, unknown>;
          let acc = 0;
          for (const key of keys) {
            const value = obj[key];
            if (typeof value !== 'number' || !Number.isFinite(value))
              return true;
            acc += value;
          }
          return Math.abs(acc - sum) < 0.001;
        },
        defaultMessage(args: ValidationArguments): string {
          const [sum, keys] = args.constraints as [number, string[]];
          return `${keys.join(' + ')} must sum to ${sum}`;
        },
      },
    });
  };
}
