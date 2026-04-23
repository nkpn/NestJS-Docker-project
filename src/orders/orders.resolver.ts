import { Resolver, Mutation, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards, ForbiddenException } from '@nestjs/common';
import { Order } from './entities/order.entity';
import { OrdersConnection } from './dto/orders-connection';
import { OrdersFilterInput } from './dto/orders-filter.input';
import { OrdersPaginationInput } from './dto/orders-pagination.input';
import { OrdersService } from './orders.service';
import { CreateOrderInput } from './dto/create-order.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';

@Resolver(() => Order)
export class OrdersResolver {
  constructor(private readonly ordersService: OrdersService) {}

  @Mutation(() => Order, {
    description: 'Create a new order (authenticated users only)',
  })
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

  @Query(() => OrdersConnection, {
    description: 'Paginated orders for the current user with optional filters',
  })
  @UseGuards(GqlAuthGuard)
  myOrders(
    @CurrentUser() user: User,
    @Args('filter', { type: () => OrdersFilterInput, nullable: true })
    filter?: OrdersFilterInput,
    @Args('pagination', { type: () => OrdersPaginationInput, nullable: true })
    pagination?: OrdersPaginationInput,
  ): Promise<OrdersConnection> {
    return this.ordersService.findByUserPaginated(user.id, filter, pagination);
  }

  @Query(() => OrdersConnection, {
    description: 'All orders with optional filters (admin only)',
  })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  orders(
    @Args('filter', { type: () => OrdersFilterInput, nullable: true })
    filter?: OrdersFilterInput,
    @Args('pagination', { type: () => OrdersPaginationInput, nullable: true })
    pagination?: OrdersPaginationInput,
  ): Promise<OrdersConnection> {
    return this.ordersService.findAllPaginated(filter, pagination);
  }
}
