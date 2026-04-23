import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  bootstrapE2eApp,
  clearDatabase,
  createOrder,
  createProduct,
  expectGraphqlErrors,
  expectGraphqlSuccess,
  gql,
  loginUser,
  registerUser,
  seedAdmin,
} from './helpers/e2e-test.helpers';

describe('Order flow (e2e)', () => {
  let app: INestApplication;
  let closeApp: () => Promise<void>;
  let dataSource: Parameters<typeof clearDatabase>[0];
  let usersRepo: Awaited<ReturnType<typeof bootstrapE2eApp>>['usersRepo'];

  beforeAll(async () => {
    const context = await bootstrapE2eApp();
    app = context.app;
    dataSource = context.dataSource;
    usersRepo = context.usersRepo;
    closeApp = context.close;
  });

  beforeEach(async () => {
    await clearDatabase(dataSource);
    await seedAdmin(usersRepo);
  });

  afterAll(async () => {
    await closeApp();
  });

  it('registers a new user and returns an access token', async () => {
    const unique = randomUUID();
    const result = await registerUser(
      app,
      `buyer-${unique}@test.com`,
      'Buyer',
      'secret123',
    );

    expect(result.accessToken).toBeDefined();
    expect(result.userId).toBeDefined();
  });

  it('allows an admin to create a product', async () => {
    const adminToken = await loginUser(app, 'admin@test.com', 'admin123');
    const product = await createProduct(app, adminToken, {
      name: `Widget-${randomUUID()}`,
      description: 'A fine widget',
      price: 29.99,
      stock: 100,
    });

    expect(product.id).toBeDefined();
    expect(Number(product.price)).toBeCloseTo(29.99);
  });

  it('creates an order for an authenticated user', async () => {
    const adminToken = await loginUser(app, 'admin@test.com', 'admin123');
    const product = await createProduct(app, adminToken, {
      name: `Widget-${randomUUID()}`,
      description: 'A fine widget',
      price: 29.99,
      stock: 100,
    });

    const { accessToken: userToken } = await registerUser(
      app,
      `buyer-${randomUUID()}@test.com`,
      'Buyer',
      'secret123',
    );

    const order = await createOrder(app, userToken, {
      items: [{ productId: product.id, quantity: 2 }],
      idempotencyKey: randomUUID(),
    });

    expect(order.status).toBe('PENDING');
    expect(Number(order.totalAmount)).toBeCloseTo(59.98);
  });

  it('returns order status for the owner and forbids other users', async () => {
    const adminToken = await loginUser(app, 'admin@test.com', 'admin123');
    const product = await createProduct(app, adminToken, {
      name: `Widget-${randomUUID()}`,
      description: 'A fine widget',
      price: 29.99,
      stock: 100,
    });

    const owner = await registerUser(
      app,
      `owner-${randomUUID()}@test.com`,
      'Owner',
      'secret123',
    );
    const order = await createOrder(app, owner.accessToken, {
      items: [{ productId: product.id, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    const orderRes = await gql(
      app,
      `
        query GetOrder($id: ID!) {
          order(id: $id) { id status userId }
        }
      `,
      { id: order.id },
      owner.accessToken,
    );
    const orderData = expectGraphqlSuccess<{
      order: { id: string; status: string };
    }>(orderRes);
    expect(orderData.order.id).toBe(order.id);

    const otherUser = await registerUser(
      app,
      `other-${randomUUID()}@test.com`,
      'Other',
      'secret123',
    );
    const forbiddenRes = await gql(
      app,
      `
        query GetOrder($id: ID!) {
          order(id: $id) { id }
        }
      `,
      { id: order.id },
      otherUser.accessToken,
    );
    expectGraphqlErrors(forbiddenRes);
  });

  it('rejects invalid createOrder input', async () => {
    const user = await registerUser(
      app,
      `buyer-${randomUUID()}@test.com`,
      'Buyer',
      'secret123',
    );

    const res = await gql(
      app,
      `
        mutation CreateOrder($input: CreateOrderInput!) {
          createOrder(input: $input) { id }
        }
      `,
      { input: { items: [] } },
      user.accessToken,
    );

    expectGraphqlErrors(res);
  });

  it('rejects order creation when stock is insufficient', async () => {
    const adminToken = await loginUser(app, 'admin@test.com', 'admin123');
    const product = await createProduct(app, adminToken, {
      name: `Widget-${randomUUID()}`,
      description: 'A fine widget',
      price: 29.99,
      stock: 1,
    });
    const user = await registerUser(
      app,
      `buyer-${randomUUID()}@test.com`,
      'Buyer',
      'secret123',
    );

    const res = await gql(
      app,
      `
        mutation CreateOrder($input: CreateOrderInput!) {
          createOrder(input: $input) { id }
        }
      `,
      { input: { items: [{ productId: product.id, quantity: 9999 }] } },
      user.accessToken,
    );

    expectGraphqlErrors(res);
  });

  it('returns the same order for duplicate idempotency keys', async () => {
    const adminToken = await loginUser(app, 'admin@test.com', 'admin123');
    const product = await createProduct(app, adminToken, {
      name: `Widget-${randomUUID()}`,
      description: 'A fine widget',
      price: 29.99,
      stock: 100,
    });
    const user = await registerUser(
      app,
      `buyer-${randomUUID()}@test.com`,
      'Buyer',
      'secret123',
    );
    const idempotencyKey = randomUUID();

    const firstOrder = await createOrder(app, user.accessToken, {
      items: [{ productId: product.id, quantity: 2 }],
      idempotencyKey,
    });
    const secondOrder = await createOrder(app, user.accessToken, {
      items: [{ productId: product.id, quantity: 2 }],
      idempotencyKey,
    });

    expect(secondOrder.id).toBe(firstOrder.id);
    expect(Number(secondOrder.totalAmount)).toBeCloseTo(
      Number(firstOrder.totalAmount),
    );
  });

  it('returns a healthy status endpoint', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(httpServer).get('/health');
    expect(res.status).toBe(200);
    const body = res.body as { status: string };
    expect(body.status).toBe('ok');
  });
});
