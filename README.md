# NestJS Orders API

Production-ready backend на NestJS для сценария обработки заказов: создание заказа через GraphQL, асинхронная обработка через RabbitMQ, ретраи с backoff и финальная фиксация статуса.

[![CI](https://github.com/nkpn/NestJS-Docker-project/actions/workflows/ci.yml/badge.svg)](https://github.com/nkpn/NestJS-Docker-project/actions/workflows/ci.yml)

## О проекте

Проект моделирует типичный e-commerce order pipeline:

- клиент отправляет GraphQL mutation `createOrder`
- заказ сохраняется как `PENDING` в PostgreSQL
- сообщение публикуется в `order_queue`
- consumer обрабатывает заказ и переводит его в `COMPLETED`
- при ошибках запускается retry-цепочка и затем DLQ

Ключевые требования, которые покрывает код:

- защита от oversell при конкурентных запросах
- идемпотентность API-запросов (`idempotencyKey`)
- идемпотентность обработки сообщений (`processed_messages`)
- наблюдаемость (health, metrics, structured logs)

## Архитектура

```text
Client (GraphQL)
    │
    ▼
NestJS App (GraphQL API)
    │
    ├── JWT Guard + RolesGuard
    │
    ▼
OrdersService
    ├── transaction + SELECT ... FOR UPDATE
    ├── idempotency key check
    └── PostgreSQL
    │
    ▼
RabbitMQ
    ├── order_queue
    ├── order_queue_retry (TTL + DLX back to order_queue)
    └── order_dlq
    │
    ▼
OrdersConsumer
    ├── processed_messages insert (exactly-once guard)
    └── COMPLETED / retry / FAILED + DLQ
```

### Модули и зоны ответственности

| Модуль | Что делает |
|---|---|
| `auth` | Регистрация/логин, выдача JWT |
| `users` | Пользователи, роли, проверка пароля |
| `products` | Каталог и остатки |
| `orders` | Бизнес-логика заказа, пагинация, producer/consumer flow |
| `rabbitmq` | Подключение AMQP, объявление main/retry/dlq очередей |
| `health` | HTTP health endpoint |

## Базовая логика

### 1. Аутентификация и авторизация

- `register`/`login` в `AuthResolver` и `AuthService`
- JWT проверяется `GqlAuthGuard`
- доступ к admin-query (`orders`) контролируется `RolesGuard` + `@Roles(Role.ADMIN)`

### 2. Создание заказа

В `OrdersService.createOrder`:

1. pre-check по `idempotencyKey` (если ключ уже есть, возвращается старый заказ)
2. открывается транзакция
3. для каждого товара берется `pessimistic_write` lock
4. проверяется и атомарно уменьшается stock
5. считается `totalAmount` (с округлением через `roundMoney`)
6. заказ сохраняется как `PENDING`
7. после commit публикуется сообщение в `order_queue`

### 3. Обработка заказа consumer-ом

В `OrdersConsumer.handleMessage`:

- сообщение валидируется контрактом `parseOrderMessage`
- `OrdersService.processOrder` пытается вставить `messageId` в `processed_messages`
- при уникальном конфликте (`23505`) сообщение считается дублем и безопасно игнорируется
- если обработка успешна, заказ переводится в `COMPLETED`
- при ошибке сообщение уходит в retry с экспоненциальной задержкой
- после исчерпания лимита заказ помечается `FAILED`, сообщение кладется в `order_dlq`

## Что используется в каком сервисе

### API слой

- `@nestjs/graphql` (Apollo, code-first)
- GraphQL schema генерируется в `src/schema.gql`
- единый формат ошибок через `normalizeGraphqlError`

### Domain + persistence

- `TypeORM` + PostgreSQL
- в `development/test`: `synchronize: true`
- в `production`: миграции (`src/data-source.ts` + `migration:*` scripts)
- поддержка двух режимов подключения:
  - `DATABASE_URL` (Neon/Render)
  - `DB_*` (локальный Docker/Postgres)

### Messaging

- `amqplib` для AMQP
- `order_queue` — основная обработка
- `order_queue_retry` — delayed retry через per-message TTL
- `order_dlq` — терминальные неуспехи

### Observability

- `nestjs-pino` (JSON в production, pretty в dev)
- `@willsoto/nestjs-prometheus` (`/metrics`)
- `@nestjs/terminus` + custom health (`/health`)
- бизнес-метрики: `orders_created_total`, `orders_processed_total{status}`

## Паттерны надежности и технические нюансы

### Паттерны

- Transactional boundary в `createOrder` и `processOrder`
- Pessimistic locking против oversell
- API idempotency через `idempotencyKey` (`UNIQUE` индекс)
- Consumer idempotency через `processed_messages.messageId` (`UNIQUE`)
- At-least-once delivery + exactly-once side effects (на уровне БД)
- Retry with exponential backoff + DLQ

### Нюансы реализации

- consumer всегда `ack`-ает исходное сообщение после публикации в retry/DLQ, чтобы не зациклить redelivery
- malformed payload discard-ится безопасно (`ack` + лог)
- `prefetch(1)` ограничивает параллельную обработку сообщений одним воркером на канал
- индексы в `orders` оптимизируют частые запросы:
  - `userId`
  - `status, createdAt DESC`
  - `idempotencyKey` (sparse unique)
- `formatError` в GraphQL удаляет лишние внутренние детали и нормализует `extensions.code/message`

## Тесты

Проект покрыт на нескольких уровнях:

- unit (`*.spec.ts` в `src/`): сервисы, util, error-normalization
- contract (`test/contract`): валидность producer/consumer message schema
- integration (`test/integration`): сервисный слой с реальным Postgres через Testcontainers
- e2e (`test/app.e2e-spec.ts`): полный GraphQL flow (auth, products, orders, permissions, ошибки)

Команды:

```bash
npm run test
npm run test:cov
npm run test:contract
npm run test:integration
NODE_ENV=test npm run test:e2e
```

## Локальный запуск

### Prerequisites

- Docker + Docker Compose v2

### Env profiles

Приложение выбирает env-файл по `NODE_ENV`:

- `development` -> `.env.development`
- `test` -> `.env.test`
- `production` -> `.env.production`
- fallback -> `.env`

Подготовка:

```bash
cp .env.development.example .env.development
cp .env.test.example .env.test
cp .env.production.example .env.production
```

Если запускаете `npm run start:dev` на хосте, используйте `localhost` в `.env.development` для `DB_HOST` и `RABBITMQ_URL`.

### Start

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

## Миграции БД

```bash
npm run migration:generate -- src/migrations/Init
npm run migration:run
npm run migration:revert
```

`src/data-source.ts` использует тот же env profile, что и само приложение.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | `development` / `production` / `test` | no (default: `development`) |
| `PORT` | HTTP port | no (default: `3000`) |
| `DATABASE_URL` | Full Postgres URL (Neon/Render), приоритетнее `DB_*` | no |
| `DATABASE_SSL` | SSL для `DATABASE_URL` | no (default: `false`) |
| `DB_HOST` | PostgreSQL host | yes (if no `DATABASE_URL`) |
| `DB_PORT` | PostgreSQL port | no (default: `5432`) |
| `DB_USERNAME` | PostgreSQL user | yes (if no `DATABASE_URL`) |
| `DB_PASSWORD` | PostgreSQL password | yes (if no `DATABASE_URL`) |
| `DB_DATABASE` | PostgreSQL database name | yes (if no `DATABASE_URL`) |
| `JWT_SECRET` | JWT signing secret | yes |
| `JWT_EXPIRES_IN` | Token expiry | no (default: `7d`) |
| `RABBITMQ_URL` | AMQP URL | yes |

## CI/CD

`.github/workflows/ci.yml` запускает:

1. Lint + TypeScript build check
2. Unit tests
3. Contract tests
4. Integration tests
5. E2E tests
6. Docker build

## Deployed Instance

Render: https://nestjs-docker-project.onrender.com

## Дополнительно

Manual production smoke checklist: [docs/manual-prod-smoke.md](docs/manual-prod-smoke.md)
