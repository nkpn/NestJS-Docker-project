# NestJS Orders API

A production-ready NestJS backend demonstrating a full end-to-end business flow:
**create order → queue processing → status transitions → query final status**

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
    ├── ProductsService (stock check + decrement — transactional)
    └── PostgreSQL (persistence)
    │
    ▼
RabbitMQ (order_queue)
    │         └── order_dlq (dead-letter on failure)
    ▼
OrdersConsumer
    │
    ▼
Order status: PENDING → PROCESSING → COMPLETED | FAILED
```

### Modules

| Module | Responsibility |
|---|---|
| `auth` | JWT authentication, register/login |
| `users` | User entity, profile query |
| `products` | Product catalog, stock management |
| `orders` | Order lifecycle, RabbitMQ publishing |
| `rabbitmq` | AMQP connection, queue setup (DLQ included) |
| `health` | `/health` endpoint |

### Tech Stack

- **NestJS 11** + TypeScript (strict)
- **GraphQL** (Apollo, code-first)
- **PostgreSQL** + TypeORM (auto-sync in dev)
- **RabbitMQ** (AMQP, dead-letter queue)
- **Pino** — structured JSON logging
- **Prometheus** metrics at `/metrics`
- **@nestjs/terminus** health checks at `/health`
- **Docker Compose** for local development
- **GitHub Actions** — lint, unit tests, e2e tests, Docker build

---

## Local Setup

### Prerequisites
- Docker & Docker Compose v2

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
```graphql
mutation {
  createOrder(input: {
    items: [{ productId: "<product-id>", quantity: 2 }]
  }) {
    id status totalAmount createdAt
  }
}
```

What happens after this mutation:
1. Stock availability validated (business rule)
2. Stock decremented in a transaction
3. Order saved as `PENDING`
4. Event published to RabbitMQ `order_queue`
5. Consumer picks it up: `PENDING` → `PROCESSING` → `COMPLETED`

### 5. Query order status
```graphql
query {
  order(id: "<order-id>") {
    id status totalAmount processedAt
    items { productId productName quantity price }
  }
}
```

### 6. List my orders
```graphql
query {
  myOrders {
    id status totalAmount createdAt
  }
}
```

---

## Running Tests

```bash
# Install dependencies
npm install

# Unit tests (no DB required)
npm run test

# Unit tests with coverage
npm run test:cov

# E2E tests (requires PostgreSQL running)
# Either run docker compose up postgres, or set env vars below:
DB_HOST=localhost DB_USERNAME=nestuser DB_PASSWORD=nestpassword \
DB_DATABASE=nestdb_test JWT_SECRET=test RABBITMQ_URL=amqp://localhost \
npm run test:e2e
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | `development` / `production` / `test` | no (default: `development`) |
| `PORT` | HTTP port | no (default: `3000`) |
| `DB_HOST` | PostgreSQL host | yes |
| `DB_PORT` | PostgreSQL port | no (default: `5432`) |
| `DB_USERNAME` | PostgreSQL user | yes |
| `DB_PASSWORD` | PostgreSQL password | yes |
| `DB_DATABASE` | PostgreSQL database name | yes |
| `JWT_SECRET` | JWT signing secret | yes |
| `JWT_EXPIRES_IN` | Token expiry | no (default: `7d`) |
| `RABBITMQ_URL` | AMQP URL | yes |

Copy `.env.example` → `.env` for local development.

---

## Observability

- `GET /health` — liveness + DB + RabbitMQ status
- `GET /metrics` — Prometheus format, scraped every 15s
- Custom metrics: `orders_created_total`, `orders_processed_total{status}`
- Pino logs: structured JSON in production, pretty-printed in development

---

## Deployed Instance

> **Render:** https://nestjs-orders-api.onrender.com

---

## CI/CD Pipeline

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. **Lint & Build** — `eslint` + `tsc --noEmit`
2. **Unit Tests** — Jest with coverage report
3. **E2E Tests** — full order flow against real PostgreSQL service
4. **Docker Build** — verify production image compiles and starts
