import { HttpException, HttpStatus } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import type { GraphQLFormattedError } from 'graphql';

type GraphqlExtensions = Record<string, unknown> & {
  code?: string;
  message?: string;
};

const HTTP_STATUS_TO_GRAPHQL_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_USER_INPUT',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BAD_USER_INPUT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMessage(message: unknown): string {
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  if (Array.isArray(message)) {
    const parts = message
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join('; ');
    }
  }

  return 'Internal server error';
}

function getGraphqlCode(status: number): string {
  return (
    HTTP_STATUS_TO_GRAPHQL_CODE[status] ??
    (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_USER_INPUT')
  );
}

function getHttpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return normalizeMessage(response);
  }

  if (isRecord(response)) {
    if ('message' in response) {
      return normalizeMessage(response.message);
    }

    if ('error' in response) {
      return normalizeMessage(response.error);
    }
  }

  return normalizeMessage(exception.message);
}

export function toGraphqlHttpError(exception: HttpException): GraphQLError {
  const status = exception.getStatus();
  const message = getHttpExceptionMessage(exception);
  const code = getGraphqlCode(status);

  return new GraphQLError(message, {
    extensions: {
      code,
      message,
    },
  });
}

export function normalizeGraphqlError(
  formattedError: GraphQLFormattedError,
  originalError?: unknown,
): GraphQLFormattedError {
  const message = normalizeMessage(formattedError.message);
  const extensions = isRecord(formattedError.extensions)
    ? (formattedError.extensions as GraphqlExtensions)
    : {};

  const inferredCode =
    typeof extensions.code === 'string' && extensions.code.trim().length > 0
      ? extensions.code
      : originalError instanceof HttpException
        ? getGraphqlCode(originalError.getStatus())
        : originalError instanceof GraphQLError &&
            typeof originalError.extensions?.code === 'string' &&
            originalError.extensions.code.trim().length > 0
          ? originalError.extensions.code
          : undefined;

  const normalizedExtensions: GraphqlExtensions = {
    ...extensions,
    code: inferredCode ?? 'INTERNAL_SERVER_ERROR',
    message,
  };

  delete normalizedExtensions.stacktrace;
  delete normalizedExtensions.exception;

  return {
    ...formattedError,
    message,
    extensions: normalizedExtensions,
  };
}
