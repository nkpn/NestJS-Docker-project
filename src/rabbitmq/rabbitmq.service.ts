import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

export const ORDER_QUEUE = 'order_queue';
export const ORDER_DLQ = 'order_dlq';
const ORDER_DLX = 'order_dlx';

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

    // Dead-letter exchange + queue
    await this.channel.assertExchange(ORDER_DLX, 'direct', { durable: true });
    await this.channel.assertQueue(ORDER_DLQ, { durable: true });
    await this.channel.bindQueue(ORDER_DLQ, ORDER_DLX, 'order.dead');

    // Main queue — failed messages go to DLQ
    await this.channel.assertQueue(ORDER_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': ORDER_DLX,
        'x-dead-letter-routing-key': 'order.dead',
      },
    });

    this.logger.log('RabbitMQ connected, queues declared');
  }

  async publish(queue: string, message: object): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    this.channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true },
    );
  }

  async consume(
    queue: string,
    handler: (msg: amqp.Message, channel: amqp.Channel) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialized');
    await this.channel.prefetch(1);
    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        await handler(msg, this.channel!);
      } catch (err) {
        this.logger.error('Consumer handler threw, sending to DLQ', err);
        this.channel!.nack(msg, false, false);
      }
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
