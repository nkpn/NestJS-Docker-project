import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GqlHttpExceptionFilter } from '../src/common/filters/gql-exception.filter';
import { User } from '../src/users/entities/user.entity';
import { Product } from '../src/products/entities/product.entity';
import { Order } from '../src/orders/entities/order.entity';
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
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let userToken: string;
  let productId: string;
  let orderId: string;

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
    const usersRepo = moduleFixture.get(getRepositoryToken(User));
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('admin123', 10);
    await usersRepo.save(
      usersRepo.create({
        email: 'admin@test.com',
        name: 'Admin',
        passwordHash: hash,
        role: Role.ADMIN,
      }),
    );
  });

  afterAll(async () => {
    // Clean up test data
    await dataSource.query('DELETE FROM orders');
    await dataSource.query('DELETE FROM products');
    await dataSource.query('DELETE FROM users');
    await app.close();
  });

  const gql = (query: string, variables?: object, token?: string) => {
    const req = request(app.getHttpServer())
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
    expect(res.body.errors).toBeUndefined();
    userToken = res.body.data.register.accessToken;
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
    adminToken = res.body.data.login.accessToken;
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
    expect(res.body.errors).toBeUndefined();
    productId = res.body.data.createProduct.id;
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
    expect(res.body.errors).toBeUndefined();
    const order = res.body.data.createOrder;
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
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.order.id).toBe(orderId);
  });

  it('6. another user cannot access the order', async () => {
    const regRes = await gql(`
      mutation {
        register(input: { email: "other@test.com", name: "Other", password: "pass123" }) {
          accessToken
        }
      }
    `);
    const otherToken = regRes.body.data.register.accessToken;

    const res = await gql(
      `query { order(id: "${orderId}") { id } }`,
      undefined,
      otherToken,
    );
    expect(res.body.errors).toBeDefined();
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
    expect(res.body.errors).toBeDefined();
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
    expect(res.body.errors).toBeDefined();
  });

  it('9. health endpoint returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
