import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GqlHttpExceptionFilter } from '../src/common/filters/gql-exception.filter';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/users/enums/role.enum';
import { OrderStatus } from '../src/orders/enums/order-status.enum';
import { RabbitmqService } from '../src/rabbitmq/rabbitmq.service';

/**
 * E2E test for the full order flow:
 * register → login → createOrder → getOrder (status check)
 *
 * Uses real TypeORM against a test DB and mocks RabbitMQ to avoid
 * requiring an actual broker during CI.
 */
describe('Order flow (e2e)', () => {
  type GraphqlResponse<TData> = {
    data?: TData;
    errors?: Array<{ message: string }>;
  };

  const getResponseBody = <T>(res: request.Response): T => {
    const body: unknown = res.body;
    return body as T;
  };

  const expectGraphqlSuccess = <TData>(res: request.Response): TData => {
    const body = getResponseBody<GraphqlResponse<TData>>(res);
    expect(body.errors).toBeUndefined();
    expect(body.data).toBeDefined();
    return body.data as TData;
  };

  const expectGraphqlErrors = (res: request.Response): void => {
    const body = getResponseBody<GraphqlResponse<Record<string, unknown>>>(res);
    expect(body.errors).toBeDefined();
  };

  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let userToken: string;
  let productId: string;
  let orderId: string;

  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  const mockRabbitmq = {
    onModuleInit: jest.fn(),
    publish: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockReturnValue(true),
    onModuleDestroy: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RabbitmqService)
      .useValue(mockRabbitmq)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new GqlHttpExceptionFilter());
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    // Seed an admin user directly via repo (bypass bcrypt for speed)
    const usersRepo = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
    const bcryptModule: typeof import('bcryptjs') = await import('bcryptjs');
    const hash = await bcryptModule.hash('admin123', 10);
    const adminUser = usersRepo.create({
      email: 'admin@test.com',
      name: 'Admin',
      passwordHash: hash,
      role: Role.ADMIN,
    });
    await usersRepo.save(adminUser);
  });

  afterAll(async () => {
    // Clean up test data
    await dataSource.query('DELETE FROM orders');
    await dataSource.query('DELETE FROM products');
    await dataSource.query('DELETE FROM users');
    await app.close();
  });

  const gql = (
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
  ) => {
    const req = request(getHttpServer())
      .post('/graphql')
      .send({ query, variables });
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  it('1. registers a new user', async () => {
    const res = await gql(`
      mutation {
        register(input: { email: "buyer@test.com", name: "Buyer", password: "secret123" }) {
          accessToken
          user { id email role }
        }
      }
    `);
    expect(res.status).toBe(200);
    const data = expectGraphqlSuccess<{ register: { accessToken: string } }>(
      res,
    );
    userToken = data.register.accessToken;
    expect(userToken).toBeDefined();
  });

  it('2. admin logs in', async () => {
    const res = await gql(`
      mutation {
        login(input: { email: "admin@test.com", password: "admin123" }) {
          accessToken
        }
      }
    `);
    expect(res.status).toBe(200);
    const data = expectGraphqlSuccess<{ login: { accessToken: string } }>(res);
    adminToken = data.login.accessToken;
    expect(adminToken).toBeDefined();
  });

  it('3. admin creates a product', async () => {
    const res = await gql(
      `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) { id name price stock }
      }
    `,
      {
        input: {
          name: 'Widget',
          description: 'A fine widget',
          price: 29.99,
          stock: 100,
        },
      },
      adminToken,
    );
    expect(res.status).toBe(200);
    const data = expectGraphqlSuccess<{ createProduct: { id: string } }>(res);
    productId = data.createProduct.id;
    expect(productId).toBeDefined();
  });

  it('4. user creates an order', async () => {
    const res = await gql(
      `
      mutation CreateOrder($input: CreateOrderInput!) {
        createOrder(input: $input) {
          id status totalAmount
          items { productId quantity price }
        }
      }
    `,
      { input: { items: [{ productId, quantity: 2 }] } },
      userToken,
    );
    expect(res.status).toBe(200);
    const data = expectGraphqlSuccess<{
      createOrder: { id: string; status: OrderStatus; totalAmount: number };
    }>(res);
    const order = data.createOrder;
    orderId = order.id;
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(Number(order.totalAmount)).toBeCloseTo(59.98);
  });

  it('5. user can query their order status', async () => {
    const res = await gql(
      `
      query GetOrder($id: ID!) {
        order(id: $id) { id status userId }
      }
    `,
      { id: orderId },
      userToken,
    );
    expect(res.status).toBe(200);
    const data = expectGraphqlSuccess<{ order: { id: string } }>(res);
    expect(data.order.id).toBe(orderId);
  });

  it('6. another user cannot access the order', async () => {
    const regRes = await gql(`
      mutation {
        register(input: { email: "other@test.com", name: "Other", password: "pass123" }) {
          accessToken
        }
      }
    `);
    const regData = expectGraphqlSuccess<{ register: { accessToken: string } }>(
      regRes,
    );
    const otherToken = regData.register.accessToken;

    const res = await gql(
      `query { order(id: "${orderId}") { id } }`,
      undefined,
      otherToken,
    );
    expectGraphqlErrors(res);
  });

  it('7. createOrder fails with invalid input (empty items)', async () => {
    const res = await gql(
      `
      mutation CreateOrder($input: CreateOrderInput!) {
        createOrder(input: $input) { id }
      }
    `,
      { input: { items: [] } },
      userToken,
    );
    expectGraphqlErrors(res);
  });

  it('8. createOrder fails with insufficient stock', async () => {
    const res = await gql(
      `
      mutation CreateOrder($input: CreateOrderInput!) {
        createOrder(input: $input) { id }
      }
    `,
      { input: { items: [{ productId, quantity: 9999 }] } },
      userToken,
    );
    expectGraphqlErrors(res);
  });

  it('9. health endpoint returns ok', async () => {
    const res = await request(getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    const body = getResponseBody<{ status: string }>(res);
    expect(body.status).toBe('ok');
  });
});
