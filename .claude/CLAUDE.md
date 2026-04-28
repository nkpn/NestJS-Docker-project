# NestJS Orders API — Project Knowledge Map

## Context Navigation
When you need to understand the codebase, docs, or any files in this project:
1. ALWAYS query the knowledge graph first: `/graphify query "your question"`
2. Only read raw files if I explicitly say "read the file" or "look at the raw file"
3. Use `graphify-out/wiki/index.md` as your navigation entrypoint for browsing structure

---

## Project Overview

Full-stack NestJS 11 backend with TypeScript strict mode. Business flow: `createOrder` GraphQL mutation → RabbitMQ → consumer → order `COMPLETED`/`FAILED`. Deployed on Render; CI on GitHub Actions.

**Stack:** NestJS 11, TypeScript strict, GraphQL (Apollo v5 code-first), TypeORM + PostgreSQL, RabbitMQ (amqplib direct), Pino logging, Prometheus metrics, Docker Compose.

---

## Module Map

| Module | Entry | Responsibility |
|---|---|---|
| `auth` | `src/auth/auth.module.ts` | JWT register/login, GqlAuthGuard, JwtStrategy |
| `users` | `src/users/users.module.ts` | User entity, profile query |
| `products` | `src/products/products.module.ts` | Product catalog, stock management |
| `orders` | `src/orders/orders.module.ts` | Order lifecycle, publisher, consumer, pagination |
| `rabbitmq` | `src/rabbitmq/rabbitmq.module.ts` | AMQP connection, queue topology setup |
| `health` | `src/health/health.module.ts` | `/health` liveness + DB + RabbitMQ |
| `config` | `src/config/` | ConfigModule, Joi env validation, env-file resolver |
| `common` | `src/common/` | `normalizeGraphqlError`, `roundMoney`, shared decorators |

---

## Critical File Index

| File | What it does |
|---|---|
| `src/app.module.ts` | Root module; wires ConfigModule, TypeORM, GraphQLModule, Pino, Prometheus, all feature modules |
| `src/main.ts` | Bootstrap; `useGlobalPipes(ValidationPipe)`, port from config |
| `src/data-source.ts` | TypeORM CLI entry point for migrations; reads `.env.<NODE_ENV>` via `resolveEnvFilePath()` |
| `src/config/env-file.ts` | `resolveEnvFilePath()` — returns `.env.<NODE_ENV>` or fallback `.env` |
| `src/config/env.validation.ts` | Joi schema for all env vars; called in `ConfigModule.forRoot` |
| `src/config/configuration.ts` | Maps env vars to config object keys (`database.*`, `jwt.*`, etc.) |
| `src/rabbitmq/rabbitmq.service.ts` | Queue topology; `publishToQueue`, `publishToRetry`, `publishToDlq`, `consume` |
| `src/orders/orders.service.ts` | `createOrder`, `processOrder`, `failOrder`, `findByUserPaginated`, `findAllPaginated` |
| `src/orders/orders.consumer.ts` | `onModuleInit` subscribes to `ORDER_QUEUE`; retry/DLQ logic |
| `src/orders/orders.resolver.ts` | `createOrder`, `order`, `myOrders`, `orders` (admin) GraphQL resolvers |
| `src/orders/entities/order.entity.ts` | Order table + DB indexes + `idempotencyKey` field |
| `src/orders/entities/processed-message.entity.ts` | `processed_messages` table; `messageId` PK for consumer dedup |
| `src/orders/contracts/order-message.contract.ts` | `OrderMessage` type, `buildOrderMessage()`, `parseOrderMessage()` (Joi) |
| `src/orders/dto/create-order.input.ts` | `CreateOrderInput` with optional `idempotencyKey` |
| `src/orders/dto/orders-filter.input.ts` | `OrdersFilterInput` — status, dateFrom, dateTo |
| `src/orders/dto/orders-pagination.input.ts` | `OrdersPaginationInput` — limit (max 100), offset |
| `src/orders/dto/orders-connection.ts` | `OrdersConnection { nodes, totalCount, pageInfo }` + `PageInfo` |
| `src/common/utils/round-money.ts` | `roundMoney(n)` — epsilon trick for float precision on decimal columns |
| `src/common/errors/graphql-error.utils.ts` | `normalizeGraphqlError()` — plugged into `GraphQLModule.formatError` |
| `src/auth/guards/gql-auth.guard.ts` | Overrides `getRequest()` for GraphQL context |
| `src/auth/guards/roles.guard.ts` | `@Roles(Role.ADMIN)` decorator, reads GQL context |

---

## Data Model (4 Tables)

### `users`
- `id` UUID PK, `email` UNIQUE, `password` (bcrypt), `name`, `role` (enum: USER/ADMIN), `createdAt`

### `products`
- `id` UUID PK, `name`, `description`, `price` decimal(10,2), `stock` int, `createdAt`

### `orders`
- `id` UUID PK, `userId` UUID FK → users, `status` enum (PENDING/COMPLETED/FAILED)
- `totalAmount` decimal(10,2), `createdAt`, `processedAt` nullable
- `idempotencyKey` text UNIQUE nullable
- `items` JSON (embedded `OrderItem[]` — `{ productId, productName, quantity, price }`)
- **Indexes:** `idx_orders_user_id` on `userId`; `idx_orders_status_created_at` on `(status, createdAt DESC)`; `idx_orders_idempotency_key` unique sparse

### `processed_messages`
- `messageId` text PK (UUID), `orderId` UUID, `processedAt` timestamptz
- Purpose: consumer exactly-once guard — INSERT with PK violation = duplicate delivery

---

## Business Flow: Critical Path

### createOrder mutation
```
1. Idempotency pre-check: findOne({ idempotencyKey }) → return existing if found
2. queryRunner.startTransaction()
3. FOR EACH item:
   a. findOne(Product, { lock: { mode: 'pessimistic_write' } })  ← SELECT FOR UPDATE
   b. Validate stock >= quantity
   c. Decrement stock, save
4. Build order with roundMoney(totalAmount), save with idempotencyKey
5. queryRunner.commitTransaction()
6. rabbitmqService.publishToQueue(buildOrderMessage({ messageId: randomUUID(), orderId }))
7. Return order
```

### OrdersConsumer.handleMessage
```
outer try/catch: malformed JSON or Joi validation fail → ack + discard

inner try: ordersService.processOrder(orderId, messageId)
  - queryRunner.startTransaction()
  - INSERT processed_messages (messageId, orderId, processedAt)
    → on PG error 23505: rollback, return (duplicate delivery, silent skip)
  - findOne(Order) — if not PENDING: commit, return
  - update Order: status=COMPLETED, processedAt=now()
  - commitTransaction()
  - ack

inner catch (processing error):
  nextAttempt = attempt + 1
  if nextAttempt <= MAX_RETRY_ATTEMPTS (3):
    delayMs = min(1000 * 2^attempt, 30000)
    publishToRetry({ ...payload, attempt: nextAttempt }, delayMs)
    ack original message
  else:
    failOrder(orderId, error.message)
    publishToDlq({ ...payload, failureReason })
    ack original message
```

### RabbitMQ Queue Topology
```
order_queue  →  consumer processes  →  COMPLETED
     ↑                ↓ (on fail, attempt <= 3)
     └── order_queue_retry (TTL per-message DLX back to order_queue)
                      ↓ (attempt > 3)
               order_dlq  (terminal)
```

---

## Architectural Decisions (WHY)

| Decision | Reason |
|---|---|
| `republish + ack` instead of `nack + requeue` | Nack requeues immediately with no delay; republish allows per-message TTL for exponential backoff |
| Per-message TTL on retry queue (not queue-level TTL) | Different messages have different delays; queue-level TTL applies the same delay to all |
| `INSERT processed_messages` as idempotency gate | Atomic check+insert in same transaction as `UPDATE order`; prevents TOCTOU race between two consumer instances |
| `SELECT FOR UPDATE` in createOrder | Prevents oversell: two concurrent requests on the last item serialize; second reads decremented stock |
| `idempotencyKey` pre-check BEFORE transaction | Avoids acquiring DB locks for pure duplicates; returning early is O(1) index lookup |
| `roundMoney()` epsilon trick | JS floating point: `(1.005 * 100) / 100` ≠ `1.01`; epsilon corrects banker's rounding artifact |
| `synchronize: !isProduction` | Dev/test auto-sync for speed; production uses migrations for safety |
| `amqplib` direct (not @nestjs/microservices) | Full control over queue topology, per-message TTL, DLX routing, and manual ack/nack |
| `OrdersConnection` (totalCount + pageInfo) | Cursor-free offset pagination; clients get total for rendering pagination controls without extra query |

---

## Gotchas & Rules

1. **Never import `ProductsService` into `OrdersService`** — stock is locked and updated inline inside `createOrder`'s transaction. `ProductsService.findById` is NOT called here.
2. **`parseOrderMessage()` must wrap every consumer message** — validates the Joi contract; outer catch discards malformed messages with ack (not nack).
3. **`processedAt` on `processed_messages` is `timestamptz`** — not `timestamp`; timezone-aware.
4. **`idempotencyKey` is sparse (nullable UNIQUE)** — PG allows multiple NULLs in a UNIQUE index; only non-null values are deduplicated.
5. **`MAX_RETRY_ATTEMPTS = 3`** — attempts 1, 2, 3 are retried; attempt 4 goes to DLQ. Consumer checks `nextAttempt <= MAX_RETRY_ATTEMPTS`.
6. **`GqlAuthGuard` overrides `getRequest()`** — standard `AuthGuard('jwt')` reads from HTTP context; GQL passes request via `context: ({ req }) => ({ req })`.
7. **`@Index` on Order entity** — both `@Index()` field decorator and `@Index(name, cols)` class decorator are used. Sparse index uses TypeORM `{ sparse: true }` option.
8. **`data-source.ts` uses same env resolver** — must import `resolveEnvFilePath` from `./config/env-file` (not duplicated inline).
9. **`roundMoney` is used in `createOrder` only** — when computing `totalAmount`; product `price` stored as-is from input.
10. **`OrdersPaginationInput.limit` max is 100** — enforced with `@Max(100)` class-validator decorator.

---

## Migrations

```bash
# Generate from current entity state
npm run migration:generate -- src/migrations/Init

# Apply pending
npm run migration:run

# Roll back last
npm run migration:revert
```

CLI entry: `src/data-source.ts` via `typeorm-ts-node-commonjs`.

---

## Prometheus Metrics

- `orders_created_total` — incremented in `OrdersService.createOrder`
- `orders_processed_total{status}` — label `status=completed|failed`; incremented in consumer

Endpoint: `GET /metrics` (registered by `@willsoto/nestjs-prometheus`).

---

## Testing

| Suite | Command | What it covers |
|---|---|---|
| Unit | `npm test` | `OrdersService` (12 tests), `RabbitmqService`, contracts |
| Contract | `npm run test:contract` | `OrderMessage` Joi schema producer/consumer compatibility |
| Integration | `npm run test:integration` | Service layer against real PostgreSQL via Testcontainers |
| E2E | `NODE_ENV=test npm run test:e2e` | Full HTTP/GQL flow against real DB |

Unit test mock pattern: `mockQueryRunner.manager` has named mocks (`managerFindOneMock`, `managerInsertMock`, `managerUpdateMock`, `managerSaveMock`). No `ProductsService` mock — it was removed.

---

## Environment Variables

| Var | Notes |
|---|---|
| `NODE_ENV` | `development`/`test`/`production`; drives env file selection and `synchronize` flag |
| `DATABASE_URL` | Full Postgres URL (Neon/Render); overrides all `DB_*` vars |
| `DATABASE_SSL` | `true` when using Neon/Render SSL; adds `{ ssl: { rejectUnauthorized: false } }` |
| `DB_HOST/PORT/USERNAME/PASSWORD/DATABASE` | Local Docker vars |
| `JWT_SECRET` | Required; signing key |
| `JWT_EXPIRES_IN` | Default `7d` |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` locally |
| `PORT` | Default `3000` |

---

## Local Dev

```bash
docker compose up --build        # full stack
npm run start:dev                # app on host (use localhost in .env.development)
```

Use `localhost` for `DB_HOST` and `RABBITMQ_URL` when running app on host. Use service DNS names (`postgres`, `rabbitmq`) when app runs inside Docker Compose.

---

## Deployment

- **Render:** https://nestjs-docker-project.onrender.com
- Uses `DATABASE_URL` + `DATABASE_SSL=true` env vars
- Production build: `npm run build && npm run start:prod`
- Migrations run manually before deploy: `npm run migration:run`

---

## CI/CD (GitHub Actions `.github/workflows/ci.yml`)

Steps on push/PR to `main`:
1. Lint & Build (`eslint` + `tsc --noEmit`)
2. Unit Tests (Jest + coverage)
3. Contract Tests
4. Integration Tests (Testcontainers PostgreSQL)
5. E2E Tests (PostgreSQL service container)
6. Docker Build (production image)
