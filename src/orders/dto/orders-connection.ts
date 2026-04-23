import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Order } from '../entities/order.entity';

@ObjectType()
export class PageInfo {
  @Field()
  hasNextPage: boolean;

  @Field()
  hasPreviousPage: boolean;
}

@ObjectType()
export class OrdersConnection {
  @Field(() => [Order])
  nodes: Order[];

  @Field(() => Int)
  totalCount: number;

  @Field(() => PageInfo)
  pageInfo: PageInfo;
}
