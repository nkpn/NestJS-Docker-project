import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import {
  normalizeGraphqlError,
  toGraphqlHttpError,
} from './graphql-error.utils';

describe('graphql-error.utils', () => {
  it('maps HttpExceptions to human-readable GraphQL errors', () => {
    const error = toGraphqlHttpError(
      new UnauthorizedException('Invalid credentials'),
    );

    expect(error).toBeInstanceOf(GraphQLError);
    expect(error.message).toBe('Invalid credentials');
    expect(error.extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Invalid credentials',
    });
  });

  it('joins array-based validation messages into a single message', () => {
    const error = toGraphqlHttpError(
      new BadRequestException({ message: ['first problem', 'second problem'] }),
    );

    expect(error.message).toBe('first problem; second problem');
    expect(error.extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      message: 'first problem; second problem',
    });
  });

  it('normalizes GraphQL formatted errors by adding code and message', () => {
    const normalized = normalizeGraphqlError(
      {
        message: 'Field "name" is not defined by type "LoginInput".',
        extensions: {
          code: 'BAD_USER_INPUT',
          stacktrace: ['stack line'],
        },
      },
      undefined,
    );

    expect(normalized.message).toBe(
      'Field "name" is not defined by type "LoginInput".',
    );
    expect(normalized.extensions).toMatchObject({
      code: 'BAD_USER_INPUT',
      message: 'Field "name" is not defined by type "LoginInput".',
    });
    expect(normalized.extensions).not.toHaveProperty('stacktrace');
  });
});
