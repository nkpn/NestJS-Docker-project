import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';

import { AuthService } from '../../src/auth/auth.service';
import { OrdersService } from '../../src/orders/orders.service';
import { ProductsService } from '../../src/products/products.service';
import {
  bootstrapIntegrationApp,
  clearDatabase,
  startPostgresContainer,
} from './integration-test.helpers';

describe('Orders domain integration', () => {
  let postgres: Awaited<ReturnType<typeof startPostgresContainer>>;
  let app: Awaited<ReturnType<typeof bootstrapIntegrationApp>>['app'];
  let closeApp: (() => Promise<void>) | undefined;
  let dataSource: DataSource;

  beforeAll(async () => {
    postgres = await startPostgresContainer();

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.DATABASE_SSL = 'false';
    process.env.JWT_SECRET = 'integration-secret';
    process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';

    const context = await bootstrapIntegrationApp();
    app = context.app;
    dataSource = context.dataSource;
    closeApp = context.close;
  });

  beforeEach(async () => {
    await clearDatabase(dataSource);
  });

  afterAll(async () => {
    await closeApp?.();
    await postgres?.stop?.();
  });

  const authService = () => app.get(AuthService);
  const productsService = () => app.get(ProductsService);
  const ordersService = () => app.get(OrdersService);

  const registerUser = async (email: string) => {
    const result = await authService().register(email, 'Buyer', 'secret123');
    return result.user;
  };

  it('persists an order and rounds the total amount', async () => {
    const user = await registerUser(`buyer-${randomUUID()}@test.com`);
    const productA = await productsService().create({
      name: `Alpha-${randomUUID()}`,
      description: 'First line item',
      price: 0.1,
      stock: 10,
    });
    const productB = await productsService().create({
      name: `Beta-${randomUUID()}`,
      description: 'Second line item',
      price: 0.2,
      stock: 10,
    });

    const order = await ordersService().createOrder(user.id, {
      items: [
        { productId: productA.id, quantity: 1 },
        { productId: productB.id, quantity: 1 },
      ],
      idempotencyKey: randomUUID(),
    });

    expect(Number(order.totalAmount)).toBe(0.3);

    const storedOrder = await ordersService().findById(order.id);
    expect(storedOrder.items).toHaveLength(2);
    expect(Number(storedOrder.totalAmount)).toBe(0.3);
  });

  it('keeps stock unchanged on duplicate idempotency key reuse', async () => {
    const user = await registerUser(`buyer-${randomUUID()}@test.com`);
    const product = await productsService().create({
      name: `Widget-${randomUUID()}`,
      description: 'Idempotent product',
      price: 29.99,
      stock: 10,
    });
    const idempotencyKey = randomUUID();

    const firstOrder = await ordersService().createOrder(user.id, {
      items: [{ productId: product.id, quantity: 2 }],
      idempotencyKey,
    });
    const secondOrder = await ordersService().createOrder(user.id, {
      items: [{ productId: product.id, quantity: 2 }],
      idempotencyKey,
    });

    expect(secondOrder.id).toBe(firstOrder.id);
    const storedProduct = await productsService().findById(product.id);
    expect(storedProduct.stock).toBe(8);
  });

  it('transitions a pending order to completed when processed', async () => {
    const user = await registerUser(`buyer-${randomUUID()}@test.com`);
    const product = await productsService().create({
      name: `Widget-${randomUUID()}`,
      description: 'Processable product',
      price: 29.99,
      stock: 10,
    });

    const order = await ordersService().createOrder(user.id, {
      items: [{ productId: product.id, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    await ordersService().processOrder(order.id, randomUUID());

    const processedOrder = await ordersService().findById(order.id);
    expect(processedOrder.status).toBe('COMPLETED');
    expect(processedOrder.processedAt).toBeDefined();
  });
});
