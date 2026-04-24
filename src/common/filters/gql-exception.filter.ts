import { Catch, HttpException } from '@nestjs/common';
import { GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { toGraphqlHttpError } from '../errors/graphql-error.utils';

@Catch()
export class GqlHttpExceptionFilter implements GqlExceptionFilter {
  catch(exception: unknown) {
    if (exception instanceof GraphQLError) {
      return exception;
    }

    if (exception instanceof HttpException) {
      return toGraphqlHttpError(exception);
    }

    return new GraphQLError('Internal server error', {
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  }
}
