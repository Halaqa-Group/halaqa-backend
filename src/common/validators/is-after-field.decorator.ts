import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

/**
 * Validates that the decorated field's string value is strictly after the sibling field.
 * Works for both HH:MM:SS time strings and YYYY-MM-DD date strings (both are
 * lexicographically ordered). Skips validation when either value is absent.
 */
export function IsAfterField(sibling: string, options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isAfterField',
      target: object.constructor,
      propertyName,
      constraints: [sibling],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const other = (args.object as Record<string, unknown>)[
            args.constraints[0] as string
          ];
          if (typeof value !== 'string' || typeof other !== 'string')
            return true;
          return value > other;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be after ${args.constraints[0] as string}`;
        },
      },
    });
  };
}
