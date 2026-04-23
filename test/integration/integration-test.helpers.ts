import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

import { GqlHttpExceptionFilter } from '../../src/common/filters/gql-exception.filter';
import { RabbitmqService } from '../../src/rabbitmq/rabbitmq.service';

export type IntegrationContext = {
  app: INestApplication;
  dataSource: DataSource;
  close: () => Promise<void>;
};

const mockRabbitmq = {
  onModuleInit: jest.fn(),
  publish: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockReturnValue(true),
  onModuleDestroy: jest.fn(),
};

export async function startPostgresContainer(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('nestdb_test')
    .withUsername('nestuser')
    .withPassword('nestpassword')
    .start();
}

export async function bootstrapIntegrationApp(): Promise<IntegrationContext> {
  // Lazy-load AppModule after env vars are set in beforeAll.
  // Jest runs this suite in CommonJS mode, so dynamic import is not available here.

  const { AppModule } = jest.requireActual<
    typeof import('../../src/app.module')
  >('../../src/app.module');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(RabbitmqService)
    .useValue(mockRabbitmq)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GqlHttpExceptionFilter());
  await app.init();

  return {
    app,
    dataSource: moduleFixture.get(DataSource),
    close: async () => {
      await app.close();
    },
  };
}

export async function clearDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE processed_messages, orders, products, users RESTART IDENTITY CASCADE',
  );
}
