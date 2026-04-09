import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  makeCounterProvider,
} from '@willsoto/nestjs-prometheus';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';
import { OrdersResolver } from './orders.resolver';
import { OrdersConsumer } from './orders.consumer';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), ProductsModule],
  providers: [
    OrdersService,
    OrdersResolver,
    OrdersConsumer,
    makeCounterProvider({
      name: 'orders_created_total',
      help: 'Total number of orders created',
    }),
    makeCounterProvider({
      name: 'orders_processed_total',
      help: 'Total number of orders processed',
      labelNames: ['status'],
    }),
  ],
})
export class OrdersModule {}
