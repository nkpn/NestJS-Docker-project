import { Resolver, Mutation, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards, ForbiddenException } from '@nestjs/common';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';
import { CreateOrderInput } from './dto/create-order.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';

@Resolver(() => Order)
export class OrdersResolver {
  constructor(private readonly ordersService: OrdersService) {}

  @Mutation(() => Order, { description: 'Create a new order (authenticated users only)' })
  @UseGuards(GqlAuthGuard)
  createOrder(
    @CurrentUser() user: User,
    @Args('input') input: CreateOrderInput,
  ): Promise<Order> {
    return this.ordersService.createOrder(user.id, input);
  }

  @Query(() => Order, { description: 'Get order by ID (owner or admin)' })
  @UseGuards(GqlAuthGuard)
  async order(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Order> {
    const order = await this.ordersService.findById(id);
    if (order.userId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You can only view your own orders');
    }
    return order;
  }

  @Query(() => [Order], { description: 'Get all orders of the current user' })
  @UseGuards(GqlAuthGuard)
  myOrders(@CurrentUser() user: User): Promise<Order[]> {
    return this.ordersService.findByUser(user.id);
  }
}
