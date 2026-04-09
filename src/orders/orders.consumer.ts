import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RabbitmqService, ORDER_QUEUE } from '../rabbitmq/rabbitmq.service';
import { OrdersService } from './orders.service';

interface OrderCreatedMessage {
  orderId: string;
}

@Injectable()
export class OrdersConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrdersConsumer.name);

  constructor(
    private readonly rabbitmqService: RabbitmqService,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitmqService.consume(
      ORDER_QUEUE,
      this.handleMessage.bind(this),
    );
  }

  private async handleMessage(
    msg: amqp.Message,
    channel: amqp.Channel,
  ): Promise<void> {
    let orderId = 'unknown';
    try {
      const payload = JSON.parse(
        msg.content.toString(),
      ) as OrderCreatedMessage;
      orderId = payload.orderId;

      this.logger.log(`Processing order from queue: ${orderId}`);
      await this.ordersService.processOrder(orderId);
      channel.ack(msg);
      this.logger.log(`Order ${orderId} acked`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Failed to process order ${orderId}: ${error.message}`,
      );
      await this.ordersService
        .failOrder(orderId, error.message)
        .catch(() => {});
      channel.nack(msg, false, false); // send to DLQ
    }
  }
}
