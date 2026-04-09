import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { HealthIndicatorResult } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly rabbitmq: RabbitmqService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.rabbitmqHealthIndicator(),
    ]);
  }

  private rabbitmqHealthIndicator(): HealthIndicatorResult {
    const isHealthy = this.rabbitmq.isHealthy();
    if (isHealthy) {
      return { rabbitmq: { status: 'up' } };
    }
    return { rabbitmq: { status: 'down' } };
  }
}
