import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { randomUUID } from 'crypto';
import { Order } from './entities/order.entity';
import { ProcessedMessage } from './entities/processed-message.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CreateOrderInput } from './dto/create-order.input';
import { OrdersFilterInput } from './dto/orders-filter.input';
import { OrdersPaginationInput } from './dto/orders-pagination.input';
import { OrdersConnection } from './dto/orders-connection';
import { Product } from '../products/entities/product.entity';
import { RabbitmqService, ORDER_QUEUE } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly rabbitmqService: RabbitmqService,
    private readonly dataSource: DataSource,
    @InjectMetric('orders_created_total')
    private readonly ordersCreatedCounter: Counter<string>,
    @InjectMetric('orders_processed_total')
    private readonly ordersProcessedCounter: Counter<string>,
  ) {}

  async createOrder(userId: string, input: CreateOrderInput): Promise<Order> {
    // Idempotency pre-check: return existing order before acquiring any locks
    if (input.idempotencyKey) {
      const existing = await this.ordersRepo.findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        this.logger.log(
          `Idempotent order returned for key=${input.idempotencyKey}`,
        );
        return existing;
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let totalAmount = 0;
      const storedItems = [];

      for (const item of input.items) {
        // Pessimistic write lock prevents two concurrent requests from
        // both reading the same stock value and both passing the check.
        const product = await queryRunner.manager.findOne(Product, {
          where: { id: item.productId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!product) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }

        if (product.stock < item.quantity) {
          throw new ForbiddenException(
            `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
          );
        }

        await queryRunner.manager
          .createQueryBuilder()
          .update('products')
          .set({ stock: () => `stock - ${item.quantity}` })
          .where('id = :id AND stock >= :qty', {
            id: product.id,
            qty: item.quantity,
          })
          .execute();

        totalAmount += Number(product.price) * item.quantity;
        storedItems.push({
          productId: product.id,
          productName: product.name,
          price: Number(product.price),
          quantity: item.quantity,
        });
      }

      const order = queryRunner.manager.create(Order, {
        userId,
        items: storedItems,
        status: OrderStatus.PENDING,
        totalAmount,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      const saved = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      this.ordersCreatedCounter.inc();
      this.logger.log(`Order created: ${saved.id} total=${totalAmount}`);

      const messageId = randomUUID();
      await this.rabbitmqService.publish(ORDER_QUEUE, {
        messageId,
        orderId: saved.id,
        attempt: 0,
        createdAt: new Date().toISOString(),
      });
      this.logger.log(
        `Order ${saved.id} published messageId=${messageId}`,
      );

      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async processOrder(orderId: string, messageId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Idempotency guard: INSERT fails with 23505 if messageId already processed.
      // This ensures exactly-once processing even with at-least-once delivery.
      await queryRunner.manager.insert(ProcessedMessage, {
        messageId,
        orderId,
        processedAt: new Date(),
      });

      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) {
        throw new NotFoundException(`Order ${orderId} not found`);
      }

      if (order.status !== OrderStatus.PENDING) {
        this.logger.warn(
          `Order ${orderId} already in status ${order.status}, skipping`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      await queryRunner.manager.update(Order, orderId, {
        status: OrderStatus.COMPLETED,
        processedAt: new Date(),
      });

      await queryRunner.commitTransaction();
      this.ordersProcessedCounter.inc({ status: 'completed' });
      this.logger.log(
        `Order ${orderId} → COMPLETED messageId=${messageId}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      if ((err as { code?: string }).code === '23505') {
        this.logger.warn(
          `Duplicate messageId=${messageId}, skipping (idempotency)`,
        );
        return;
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async failOrder(orderId: string, reason: string): Promise<void> {
    await this.ordersRepo.update(orderId, {
      status: OrderStatus.FAILED,
      failureReason: reason,
    });
    this.ordersProcessedCounter.inc({ status: 'failed' });
    this.logger.warn(`Order ${orderId} → FAILED: ${reason}`);
  }

  async findById(orderId: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return order;
  }

  async findByUserPaginated(
    userId: string,
    filter?: OrdersFilterInput,
    pagination?: OrdersPaginationInput,
  ): Promise<OrdersConnection> {
    this.validateDateRange(filter);
    const limit = pagination?.limit ?? 20;
    const offset = pagination?.offset ?? 0;

    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .where('order.userId = :userId', { userId })
      .orderBy('order.createdAt', 'DESC');

    this.applyFilters(qb, filter);

    const totalCount = await qb.getCount();
    const nodes = await qb.skip(offset).take(limit).getMany();

    return {
      nodes,
      totalCount,
      pageInfo: {
        hasNextPage: offset + limit < totalCount,
        hasPreviousPage: offset > 0,
      },
    };
  }

  async findAllPaginated(
    filter?: OrdersFilterInput,
    pagination?: OrdersPaginationInput,
  ): Promise<OrdersConnection> {
    this.validateDateRange(filter);
    const limit = pagination?.limit ?? 20;
    const offset = pagination?.offset ?? 0;

    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .orderBy('order.createdAt', 'DESC');

    this.applyFilters(qb, filter);

    const totalCount = await qb.getCount();
    const nodes = await qb.skip(offset).take(limit).getMany();

    return {
      nodes,
      totalCount,
      pageInfo: {
        hasNextPage: offset + limit < totalCount,
        hasPreviousPage: offset > 0,
      },
    };
  }

  private applyFilters(
    qb: ReturnType<Repository<Order>['createQueryBuilder']>,
    filter?: OrdersFilterInput,
  ): void {
    if (!filter) return;
    if (filter.status) {
      qb.andWhere('order.status = :status', { status: filter.status });
    }
    if (filter.dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }
    if (filter.dateTo) {
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: filter.dateTo });
    }
  }

  private validateDateRange(filter?: OrdersFilterInput): void {
    if (filter?.dateFrom && filter?.dateTo && filter.dateFrom > filter.dateTo) {
      throw new BadRequestException('dateFrom must be <= dateTo');
    }
  }
}
