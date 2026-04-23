import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export const ORDER_QUEUE = 'order_queue';
export const ORDER_RETRY_QUEUE = 'order_queue_retry';
export const ORDER_DLQ = 'order_dlq';
const ORDER_DLX = 'order_dlx';

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRY_MAX_DELAY_MS = 30_000;

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    const url = this.configService.get<string>('rabbitmq.url')!;
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    // Dead-letter exchange — terminal destination for exhausted messages
    await this.channel.assertExchange(ORDER_DLX, 'direct', { durable: true });
    await this.channel.assertQueue(ORDER_DLQ, { durable: true });
    await this.channel.bindQueue(ORDER_DLQ, ORDER_DLX, 'order.dead');

    // Main queue — messages that exhaust retries go to DLX
    await this.channel.assertQueue(ORDER_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': ORDER_DLX,
        'x-dead-letter-routing-key': 'order.dead',
      },
    });

    // Retry queue — per-message TTL; expired messages route back to ORDER_QUEUE
    await this.channel.assertQueue(ORDER_RETRY_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': ORDER_QUEUE,
      },
    });

    this.logger.log('RabbitMQ connected, queues declared');
  }

  publish(queue: string, message: object): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    return Promise.resolve();
  }

  /** Publish a message to the retry queue with a TTL-based delay.
   *  After the TTL expires the broker routes it back to ORDER_QUEUE. */
  publishToRetry(message: object, delayMs: number): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    this.channel.sendToQueue(
      ORDER_RETRY_QUEUE,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        expiration: String(delayMs),
      },
    );
    return Promise.resolve();
  }

  /** Publish a message directly to the dead-letter queue (terminal failure). */
  publishToDlq(message: object): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    this.channel.sendToQueue(ORDER_DLQ, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    return Promise.resolve();
  }

  async consume(
    queue: string,
    handler: (msg: amqp.Message, channel: amqp.Channel) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    await this.channel.prefetch(1);
    await this.channel.consume(queue, (msg) => {
      if (!msg) return;
      void handler(msg, this.channel!).catch((err: unknown) => {
        this.logger.error('Consumer handler threw, nacking to DLQ', err);
        this.channel!.nack(msg, false, false);
      });
    });
    this.logger.log(`Consumer registered on queue: ${queue}`);
  }

  isHealthy(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.logger.log('RabbitMQ connection closed');
  }
}
