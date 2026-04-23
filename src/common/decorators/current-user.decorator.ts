import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User } from '../../users/entities/user.entity';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const gqlCtx = GqlExecutionContext.create(ctx);
    const context = gqlCtx.getContext<{ req: { user: User } }>();
    return context.req.user;
  },
);
