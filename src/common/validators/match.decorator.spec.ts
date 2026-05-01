import { validate } from 'class-validator';
import { Match } from './match.decorator';

class ResetPasswordPayload {
  password!: string;

  @Match('password')
  password_confirmation!: string;
}

class CustomMessagePayload {
  password!: string;

  @Match('password', { message: 'passwords must match' })
  password_confirmation!: string;
}

function payload<T extends object>(Cls: new () => T, fields: Partial<T>): T {
  return Object.assign(new Cls(), fields);
}

describe('@Match', () => {
  it('passes validation when the two fields are equal', async () => {
    const errors = await validate(
      payload(ResetPasswordPayload, {
        password: 'NewPassw0rd!',
        password_confirmation: 'NewPassw0rd!',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('fails validation when the two fields differ', async () => {
    const errors = await validate(
      payload(ResetPasswordPayload, {
        password: 'NewPassw0rd!',
        password_confirmation: 'different',
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('password_confirmation');
    expect(Object.keys(errors[0].constraints ?? {})).toContain('Match');
  });

  it('uses the default message when none is supplied', async () => {
    const errors = await validate(
      payload(ResetPasswordPayload, {
        password: 'a',
        password_confirmation: 'b',
      }),
    );

    expect(errors[0].constraints?.Match).toBe(
      'password_confirmation must match password',
    );
  });

  it('honors a custom message', async () => {
    const errors = await validate(
      payload(CustomMessagePayload, {
        password: 'a',
        password_confirmation: 'b',
      }),
    );

    expect(errors[0].constraints?.Match).toBe('passwords must match');
  });
});
