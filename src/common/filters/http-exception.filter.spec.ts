import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function makeResponse(): MockResponse {
  const res: Partial<MockResponse> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as MockResponse;
}

function makeHost(response: MockResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let response: MockResponse;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    response = makeResponse();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('catch', () => {
    it('produces { code, message } for a UnauthorizedException with a string message', () => {
      filter.catch(
        new UnauthorizedException('Invalid credentials'),
        makeHost(response),
      );

      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith({
        code: 401,
        message: 'Invalid credentials',
      });
    });

    it('uses the default exception message when none is provided', () => {
      filter.catch(new NotFoundException(), makeHost(response));

      expect(response.status).toHaveBeenCalledWith(404);
      expect(response.json).toHaveBeenCalledWith({
        code: 404,
        message: 'Not Found',
      });
    });

    it('flattens a single-element validation array into a string message', () => {
      filter.catch(
        new BadRequestException({
          statusCode: 400,
          message: ['email must be an email'],
          error: 'Bad Request',
        }),
        makeHost(response),
      );

      expect(response.json).toHaveBeenCalledWith({
        code: 400,
        message: 'email must be an email',
      });
    });

    it('promotes a multi-error validation array to a details field', () => {
      filter.catch(
        new BadRequestException({
          statusCode: 400,
          message: ['email must be an email', 'password is too short'],
          error: 'Bad Request',
        }),
        makeHost(response),
      );

      expect(response.json).toHaveBeenCalledWith({
        code: 400,
        message: 'email must be an email',
        details: ['email must be an email', 'password is too short'],
      });
    });

    it('maps unknown exceptions to a 500 envelope without leaking the original error', () => {
      filter.catch(new Error('database is on fire'), makeHost(response));

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({
        code: 500,
        message: 'Internal server error',
      });
    });

    it('logs unknown exceptions so they are not silently swallowed', () => {
      const spy = jest.spyOn(Logger.prototype, 'error');
      const err = new Error('database is on fire');

      filter.catch(err, makeHost(response));

      expect(spy).toHaveBeenCalledWith(err);
    });
  });
});
