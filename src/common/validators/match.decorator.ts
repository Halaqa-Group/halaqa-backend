import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

export function Match(property: string, options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'Match',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const related = (args.object as Record<string, unknown>)[
            args.constraints[0] as string
          ];
          return value === related;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must match ${args.constraints[0] as string}`;
        },
      },
    });
  };
}
