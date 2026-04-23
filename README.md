# NestJS Orders API

A production-ready NestJS backend demonstrating a full end-to-end business flow:
**create order → queue processing → retry on failure → status query**

[![CI](https://github.com/nkpn/NestJS-Docker-project/actions/workflows/ci.yml/badge.svg)](https://github.com/nkpn/NestJS-Docker-project/actions/workflows/ci.yml)

## Architecture

```
Client (GraphQL)
    │
    ▼
NestJS App (GraphQL API)
    │
    ├── JWT Guard + RolesGuard
    │
    ▼
OrdersService
    ├── Pessimistic lock (SELECT … FOR UPDATE) — prevents oversell
    ├── Idempotency key check — deduplicates retried mutations
    └── PostgreSQL (persistence, indexes on userId / status+createdAt)
    │
    ▼
RabbitMQ
    ├── order_queue        (main)
    ├── order_queue_retry  (TTL delay, DLX → order_queue)
    └── order_dlq          (terminal after 3 attempts)
    │
    ▼
OrdersConsumer
    ├── processed_messages INSERT — exactly-once processing
    └── Exponential backoff: 1 s → 2 s → 4 s → DLQ
    │
    ▼
Order status: PENDING → COMPLETED | FAILED
```

### Modules

| Module | Responsibility |
|---|---|
| `auth` | JWT authentication, register/login |
| `users` | User entity, profile query |
| `products` | Product catalog, stock management |
| `orders` | Order lifecycle, RabbitMQ publishing, pagination |
| `rabbitmq` | AMQP connection, main / retry / DLQ queue setup |
| `health` | `/health` endpoint |

### Tech Stack

- **NestJS 11** + TypeScript (strict)
- **GraphQL** (Apollo, code-first) — paginated connections
- **PostgreSQL** + TypeORM (auto-sync in dev; **migrations** for production)
- **RabbitMQ** (AMQP, retry queue with exponential backoff, DLQ)
- **Pino** — structured JSON logging
- **Prometheus** metrics at `/metrics`
- **@nestjs/terminus** health checks at `/health`
- **Docker Compose** for local development
- **GitHub Actions** — lint, unit tests, contract tests, integration tests, e2e tests, Docker build

---

## Local Setup

### Prerequisites
- Docker & Docker Compose v2

### Environment profiles

The app loads exactly one env file based on `NODE_ENV`:

- `NODE_ENV=development` → `.env.development`
- `NODE_ENV=test` → `.env.test`
- `NODE_ENV=production` → `.env.production`
- fallback (if the specific file is missing) → `.env`

The same rule is used by TypeORM CLI (`src/data-source.ts`) for migrations.

Create local env files from templates:

```bash
cp .env.development.example .env.development
cp .env.test.example .env.test
cp .env.production.example .env.production
```

For local `npm run start:dev` (app on host), use `localhost` in
`.env.development` for `DB_HOST` and `RABBITMQ_URL`.
If the app runs inside Docker Compose, service DNS names (`postgres`, `rabbitmq`)
are injected by `docker-compose.yml`.

### Run in one command

```bash
git clone https://github.com/nkpn/NestJS-Docker-project.git
cd NestJS-Docker-project
docker compose up --build
```

| URL | Description |
|---|---|
| http://localhost:3000/graphql | GraphQL Playground |
| http://localhost:3000/health | Health check |
| http://localhost:3000/metrics | Prometheus metrics |
| http://localhost:15672 | RabbitMQ UI (guest / guest) |
| http://localhost:9090 | Prometheus UI |

### Database migrations

In **development** the schema is kept in sync automatically (`synchronize: true`).
In **production** (or when you want versioned changes) use migrations:

```bash
# 1. Generate a migration from the current entity state
npm run migration:generate -- src/migrations/Init

# 2. Apply all pending migrations
npm run migration:run

# 3. Roll back the last applied migration
npm run migration:revert
```

`src/data-source.ts` is the TypeORM CLI entry point — it reads the same
environment profile as the application (`.env.<NODE_ENV>` or fallback `.env`)
and supports both `DATABASE_URL` (Neon/Render) and individual `DB_*` vars
(local Docker).

---

## End-to-End Business Flow

### 1. Register
```graphql
mutation {
  register(input: {
    email: "buyer@example.com"
    name: "John Doe"
    password: "secret123"
  }) {
    accessToken
    user { id email role }
  }
}
```

### 2. Login
```graphql
mutation {
  login(input: { email: "buyer@example.com", password: "secret123" }) {
    accessToken
  }
}
```
Add header: `Authorization: Bearer <accessToken>`

### 3. Create product (admin only)
```graphql
mutation {
  createProduct(input: {
    name: "Widget Pro"
    description: "A top-tier widget"
    price: 49.99
    stock: 100
  }) {
    id name price stock
  }
}
```

### 4. Create order (authenticated)

`idempotencyKey` is optional. When provided, retrying the same mutation returns
the original order instead of creating a duplicate.

```graphql
mutation {
  createOrder(input: {
    items: [{ productId: "<product-id>", quantity: 2 }]
    idempotencyKey: "client-generated-uuid"   # optional
  }) {
    id status totalAmount createdAt idempotencyKey
  }
}
```

What happens inside this mutation:
1. **Idempotency pre-check** — if `idempotencyKey` already exists, the existing order is returned immediately (no locks acquired)
2. **Pessimistic lock** — `SELECT … FOR UPDATE` on each product row prevents two concurrent requests from both reading the same stock value
3. Stock validated and decremented atomically inside the transaction
4. Order saved as `PENDING`
5. Message published to RabbitMQ `order_queue` with `{ messageId, orderId, attempt: 0 }`
6. Consumer processes the order → `COMPLETED` (or retries on failure)

### 5. Query order status
```graphql
query {
  order(id: "<order-id>") {
    id status totalAmount processedAt
    items { productId productName quantity price }
  }
}
```

### 6. List my orders — paginated

`myOrders` returns a connection with `totalCount` and `pageInfo` so clients
can implement cursor-free offset pagination without fetching the entire history.

```graphql
query {
  myOrders(
    filter: { status: PENDING, dateFrom: "2025-01-01T00:00:00Z" }
    pagination: { limit: 10, offset: 0 }
  ) {
    totalCount
    pageInfo { hasNextPage hasPreviousPage }
    nodes {
      id status totalAmount createdAt
    }
  }
}
```

Both `filter` and `pagination` are optional. Defaults: `limit = 20`, `offset = 0`.

### 7. List all orders (admin only)

Admins get the same connection type but across all users:

```graphql
query {
  orders(
    filter: { status: FAILED }
    pagination: { limit: 50, offset: 0 }
  ) {
    totalCount
    pageInfo { hasNextPage hasPreviousPage }
    nodes { id userId status totalAmount createdAt }
  }
}
```

---

## Reliability Patterns

### Oversell protection — pessimistic locking

Stock validation uses `SELECT … FOR UPDATE` inside the same transaction that
decrements stock. Two concurrent requests for the last item will serialize:
the second request reads the already-decremented value and gets a
`ForbiddenException` rather than producing negative stock.

### Request-level idempotency

Pass an `idempotencyKey` (client-generated UUID) in `createOrder`. The key is
stored with a `UNIQUE` constraint on the `orders` table. A retried mutation with
the same key returns the existing order — the transaction and stock decrement
are never executed a second time.

### At-least-once delivery + exactly-once processing

RabbitMQ delivers messages at least once. The consumer protects against
duplicate processing with a `processed_messages` table:

1. A transaction opens.
2. `INSERT INTO processed_messages (message_id, ...)` is attempted.
3. If Postgres returns `23505` (unique violation) — duplicate delivery — the transaction is rolled back silently and the message is acknowledged.
4. If the insert succeeds, the order is updated to `COMPLETED` in the same transaction and committed.

This guarantees that a message re-delivered after a consumer crash has no
observable side effects.

### Retry queue with exponential backoff

| Attempt | Delay |
|---|---|
| 1 | 1 s |
| 2 | 2 s |
| 3 | 4 s |
| > 3 | → `order_dlq` |

On failure the consumer **acknowledges** the original message and
**republishes** to `order_queue_retry` with a per-message TTL. After the TTL
expires the broker routes it back to `order_queue` via the dead-letter
exchange — no polling or scheduled jobs needed.

After 3 failed attempts the order is marked `FAILED` and the message is
published to `order_dlq` for manual inspection.

### Database indexes

| Index | Columns | Purpose |
|---|---|---|
| `idx_orders_user_id` | `userId` | `myOrders` lookup |
| `idx_orders_status_created_at` | `status, createdAt DESC` | filtered + sorted listing |
| `idx_orders_idempotency_key` | `idempotencyKey` | unique, sparse — dedup pre-check |

---

## Running Tests

```bash
# Install dependencies
npm install

# Unit tests (no DB required)
npm run test

# Unit tests with coverage
npm run test:cov

# Contract tests for queue message schema
npm run test:contract

# Integration tests with Testcontainers
npm run test:integration

# E2E tests (requires PostgreSQL running)
# 1) Ensure .env.test exists
# 2) Run Postgres locally (for example: docker compose up -d postgres)
NODE_ENV=test npm run test:e2e
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | `development` / `production` / `test` | no (default: `development`) |
| `PORT` | HTTP port | no (default: `3000`) |
| `DATABASE_URL` | Full Postgres URL (Neon/Render) — overrides `DB_*` | no |
| `DATABASE_SSL` | Enable SSL when `DATABASE_URL` is used | no (default: `false`) |
| `DB_HOST` | PostgreSQL host | yes (if no `DATABASE_URL`) |
| `DB_PORT` | PostgreSQL port | no (default: `5432`) |
| `DB_USERNAME` | PostgreSQL user | yes (if no `DATABASE_URL`) |
| `DB_PASSWORD` | PostgreSQL password | yes (if no `DATABASE_URL`) |
| `DB_DATABASE` | PostgreSQL database name | yes (if no `DATABASE_URL`) |
| `JWT_SECRET` | JWT signing secret | yes |
| `JWT_EXPIRES_IN` | Token expiry | no (default: `7d`) |
| `RABBITMQ_URL` | AMQP URL | yes |

Use environment-specific files:
- `.env.development` for local development
- `.env.test` for tests
- `.env.production` for deployment

---

## Observability

- `GET /health` — liveness + DB + RabbitMQ status
- `GET /metrics` — Prometheus format, scraped every 15s
- Custom metrics: `orders_created_total`, `orders_processed_total{status}`
- Pino logs: structured JSON in production, pretty-printed in development
- Consumer logs include `result=success|retry|dlq`, `messageId`, `orderId`, `attempt` on every message

---

## Deployed Instance

> **Render:** https://nestjs-docker-project.onrender.com
---

## CI/CD Pipeline

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. **Lint & Build** — `eslint` + `tsc --noEmit`
2. **Unit Tests** — Jest with coverage report
3. **Contract Tests** — queue message schema compatibility for producer/consumer
4. **Integration Tests** — service layer against real PostgreSQL via Testcontainers
5. **E2E Tests** — full order flow against real PostgreSQL service
6. **Docker Build** — verify production image compiles and starts
