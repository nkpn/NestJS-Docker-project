import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { GqlHttpExceptionFilter } from '../../src/common/filters/gql-exception.filter';
import { RabbitmqService } from '../../src/rabbitmq/rabbitmq.service';
import { User } from '../../src/users/entities/user.entity';
import { Role } from '../../src/users/enums/role.enum';

type GraphqlError = {
  message: string;
  extensions?: {
    code?: string;
    message?: string;
  };
};

type GraphqlResponse<TData> = {
  data?: TData;
  errors?: GraphqlError[];
};

export type E2eContext = {
  app: INestApplication;
  dataSource: DataSource;
  usersRepo: Repository<User>;
  close: () => Promise<void>;
};

const mockRabbitmq = {
  onModuleInit: jest.fn(),
  publish: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockReturnValue(true),
  onModuleDestroy: jest.fn(),
};

export async function bootstrapE2eApp(): Promise<E2eContext> {
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

  const dataSource = moduleFixture.get(DataSource);
  const usersRepo = moduleFixture.get<Repository<User>>(
    getRepositoryToken(User),
  );

  return {
    app,
    dataSource,
    usersRepo,
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

export async function seedAdmin(usersRepo: Repository<User>): Promise<User> {
  const hash = await bcrypt.hash('admin123', 10);
  const adminUser = usersRepo.create({
    email: 'admin@test.com',
    name: 'Admin',
    passwordHash: hash,
    role: Role.ADMIN,
  });
  return usersRepo.save(adminUser);
}

export function gql(
  app: INestApplication,
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
) {
  const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  const req = request(httpServer).post('/graphql').send({ query, variables });

  if (token) {
    req.set('Authorization', `Bearer ${token}`);
  }

  return req;
}

export function expectGraphqlSuccess<TData>(res: request.Response): TData {
  const body = res.body as GraphqlResponse<TData>;
  expect(body.errors).toBeUndefined();
  expect(body.data).toBeDefined();
  return body.data as TData;
}

export function expectGraphqlErrors(res: request.Response): void {
  const body = res.body as GraphqlResponse<Record<string, unknown>>;
  expect(body.errors).toBeDefined();
}

export function getGraphqlErrors(res: request.Response): GraphqlError[] {
  const body = res.body as GraphqlResponse<Record<string, unknown>>;
  expect(body.errors).toBeDefined();
  return body.errors as GraphqlError[];
}

export async function registerUser(
  app: INestApplication,
  email: string,
  name: string,
  password: string,
): Promise<{ accessToken: string; userId: string }> {
  const res = await gql(
    app,
    `
      mutation Register($input: RegisterInput!) {
        register(input: $input) {
          accessToken
          user { id }
        }
      }
    `,
    {
      input: { email, name, password },
    },
  );

  const data = expectGraphqlSuccess<{
    register: { accessToken: string; user: { id: string } };
  }>(res);

  return {
    accessToken: data.register.accessToken,
    userId: data.register.user.id,
  };
}

export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await gql(
    app,
    `
      mutation Login($input: LoginInput!) {
        login(input: $input) {
          accessToken
        }
      }
    `,
    {
      input: { email, password },
    },
  );

  const data = expectGraphqlSuccess<{ login: { accessToken: string } }>(res);
  return data.login.accessToken;
}

export async function createProduct(
  app: INestApplication,
  token: string,
  input: {
    name: string;
    description?: string;
    price: number;
    stock: number;
  },
): Promise<{ id: string; price: number }> {
  const res = await gql(
    app,
    `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) { id price stock }
      }
    `,
    { input },
    token,
  );

  const data = expectGraphqlSuccess<{
    createProduct: { id: string; price: number };
  }>(res);

  return data.createProduct;
}

export async function createOrder(
  app: INestApplication,
  token: string,
  input: {
    items: Array<{ productId: string; quantity: number }>;
    idempotencyKey?: string;
  },
): Promise<{ id: string; status: string; totalAmount: number }> {
  const res = await gql(
    app,
    `
      mutation CreateOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
          id status totalAmount
        }
      }
    `,
    { input },
    token,
  );

  const data = expectGraphqlSuccess<{
    createOrder: { id: string; status: string; totalAmount: number };
  }>(res);

  return data.createOrder;
}
