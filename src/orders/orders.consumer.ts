import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  RabbitmqService,
  ORDER_QUEUE,
  MAX_RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from '../rabbitmq/rabbitmq.service';
import { OrdersService } from './orders.service';

export interface OrderMessage {
  messageId: string;
  orderId: string;
  attempt: number;
  createdAt: string;
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
    let payload: OrderMessage;

    try {
      payload = JSON.parse(msg.content.toString()) as OrderMessage;
    } catch {
      this.logger.error('Malformed message payload, discarding');
      channel.ack(msg);
      return;
    }

    const { messageId, orderId, attempt = 0 } = payload;
    this.logger.log(
      `Processing order ${orderId} messageId=${messageId} attempt=${attempt}`,
    );

    try {
      await this.ordersService.processOrder(orderId, messageId);
      channel.ack(msg);
      this.logger.log(
        `result=success messageId=${messageId} orderId=${orderId}`,
      );
    } catch (err) {
      const error = err as Error;
      const nextAttempt = attempt + 1;

      if (nextAttempt <= MAX_RETRY_ATTEMPTS) {
        // Exponential backoff: base * 2^attempt, capped at max
        const delayMs = Math.min(
          RETRY_BASE_DELAY_MS * 2 ** attempt,
          RETRY_MAX_DELAY_MS,
        );
        this.logger.warn(
          `result=retry messageId=${messageId} orderId=${orderId} attempt=${attempt} reason=${error.message}; nextAttempt=${nextAttempt}; delayMs=${delayMs}`,
        );
        await this.rabbitmqService.publishToRetry(
          { ...payload, attempt: nextAttempt },
          delayMs,
        );
        channel.ack(msg);
      } else {
        this.logger.error(
          `result=dlq messageId=${messageId} orderId=${orderId} attempt=${attempt} reason=${error.message}`,
        );
        await this.ordersService
          .failOrder(orderId, error.message)
          .catch(() => {});
        await this.rabbitmqService.publishToDlq({
          ...payload,
          failureReason: error.message,
        });
        channel.ack(msg);
      }
    }
  }
}
