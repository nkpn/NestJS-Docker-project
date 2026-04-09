import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CreateOrderInput } from './dto/create-order.input';
import { ProductsService } from '../products/products.service';
import { RabbitmqService, ORDER_QUEUE } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly productsService: ProductsService,
    private readonly rabbitmqService: RabbitmqService,
    private readonly dataSource: DataSource,
    @InjectMetric('orders_created_total')
    private readonly ordersCreatedCounter: Counter<string>,
    @InjectMetric('orders_processed_total')
    private readonly ordersProcessedCounter: Counter<string>,
  ) {}

  async createOrder(userId: string, input: CreateOrderInput): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let totalAmount = 0;
      const storedItems = [];

      // Business rule: validate stock for each item
      for (const item of input.items) {
        const product = await this.productsService.findById(item.productId);

        if (product.stock < item.quantity) {
          throw new ForbiddenException(
            `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
          );
        }

        // Decrement stock within transaction
        await queryRunner.manager
          .createQueryBuilder()
          .update('products')
          .set({ stock: () => `stock - ${item.quantity}` })
          .where('id = :id AND stock >= :qty', {
            id: product.id,
            qty: item.quantity,
          })
          .execute();

        const itemTotal = Number(product.price) * item.quantity;
        totalAmount += itemTotal;
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
      });
      const saved = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      this.ordersCreatedCounter.inc();
      this.logger.log(`Order created: ${saved.id}, total: ${totalAmount}`);

      // Publish to RabbitMQ after successful commit
      await this.rabbitmqService.publish(ORDER_QUEUE, { orderId: saved.id });
      this.logger.log(`Order ${saved.id} published to queue`);

      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async processOrder(orderId: string): Promise<void> {
    const order = await this.findById(orderId);

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Order ${orderId} already in status ${order.status}, skipping`,
      );
      return;
    }

    await this.ordersRepo.update(orderId, { status: OrderStatus.PROCESSING });
    this.logger.log(`Order ${orderId} → PROCESSING`);

    // Simulate async processing (e.g. payment gateway, warehouse)
    await new Promise((r) => setTimeout(r, 500));

    await this.ordersRepo.update(orderId, {
      status: OrderStatus.COMPLETED,
      processedAt: new Date(),
    });

    this.ordersProcessedCounter.inc({ status: 'completed' });
    this.logger.log(`Order ${orderId} → COMPLETED`);
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

  async findByUser(userId: string): Promise<Order[]> {
    return this.ordersRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
