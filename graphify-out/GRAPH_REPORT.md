# Graph Report - .  (2026-04-28)

## Corpus Check
- Corpus is ~9,720 words - fits in a single context window. You may not need a graph.

## Summary
- 240 nodes · 317 edges · 22 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]

## God Nodes (most connected - your core abstractions)
1. `OrdersService` - 27 edges
2. `RabbitmqService` - 17 edges
3. `OrdersResolver` - 15 edges
4. `Order` - 12 edges
5. `UsersService` - 11 edges
6. `OrdersConsumer` - 10 edges
7. `ProductsService` - 9 edges
8. `AppModule (Root Module)` - 8 edges
9. `ProductsService` - 7 edges
10. `JwtStrategy` - 7 edges

## Surprising Connections (you probably didn't know these)
- `NestJS Orders API README` --references--> `OrdersConsumer`  [EXTRACTED]
  README.md → /Users/nkpn/Documents/GitHub/NestJS-Docker-project/src/orders/orders.consumer.ts
- `Rationale: Retry Queue with Exponential Backoff` --rationale_for--> `OrdersConsumer`  [EXTRACTED]
  README.md → /Users/nkpn/Documents/GitHub/NestJS-Docker-project/src/orders/orders.consumer.ts
- `Rationale: Pessimistic Locking for Oversell Prevention` --rationale_for--> `OrdersService`  [EXTRACTED]
  README.md → /Users/nkpn/Documents/GitHub/NestJS-Docker-project/src/orders/orders.service.ts
- `Rationale: Request-Level Idempotency via idempotencyKey` --rationale_for--> `CreateOrderInput`  [EXTRACTED]
  README.md → /Users/nkpn/Documents/GitHub/NestJS-Docker-project/src/orders/dto/create-order.input.ts
- `Rationale: At-least-once delivery + Exactly-once processing via processed_messages` --rationale_for--> `ProcessedMessage`  [EXTRACTED]
  README.md → /Users/nkpn/Documents/GitHub/NestJS-Docker-project/src/orders/entities/processed-message.entity.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (19): CreateOrderInput, Order, StoredOrderItem, OrderItemInput, OrderStatus Enum (PENDING/PROCESSING/COMPLETED/FAILED), OrdersConnection, PageInfo, OrdersFilterInput (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (13): roundMoney(), roundMoney Unit Tests, buildOrderMessage(), OrderMessage Contract, parseOrderMessage(), OrdersConsumer, RabbitmqModule, MAX_RETRY_ATTEMPTS constant (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (7): AuthService, seedAdmin(), Role Enum (USER/ADMIN), User, UsersModule, UsersResolver, UsersService

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (2): ProductsResolver, ProductsService

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (11): AuthResponse, AuthModule, AuthResolver, AuthService, Configuration Factory, CurrentUser Decorator, GqlAuthGuard, JwtPayload Interface (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (16): E2E Test Suite (Order Flow), AppModule (Root Module), resolveEnvFilePath (env-file.ts), envValidationSchema (Joi), Order Message Contract Test, CreateProductInput DTO, TypeORM CLI DataSource, E2E Test Helpers (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (6): createOrder(), createProduct(), expectGraphqlSuccess(), gql(), loginUser(), registerUser()

### Community 7 - "Community 7"
Cohesion: 0.38
Nodes (8): GqlHttpExceptionFilter, getGraphqlCode(), getHttpExceptionMessage(), isRecord(), normalizeGraphqlError(), normalizeMessage(), graphql-error.utils Unit Tests, toGraphqlHttpError()

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (3): AuthResolver, authService(), registerUser()

### Community 9 - "Community 9"
Cohesion: 0.25
Nodes (2): HealthController, HealthModule

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (3): Roles(), ROLES_KEY constant, RolesGuard

### Community 13 - "Community 13"
Cohesion: 0.5
Nodes (1): AppController

### Community 14 - "Community 14"
Cohesion: 0.67
Nodes (1): AppService

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (3): AppController, AppController Unit Test, AppService

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (1): AppModule

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (1): ProductsModule

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (1): UpdateStockInput

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (1): CreateProductInput

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (1): Product

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (1): AuthModule

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): ESLint Config

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): Test Environment Setup

## Knowledge Gaps
- **18 isolated node(s):** `AppModule`, `ProductsModule`, `UpdateStockInput`, `CreateProductInput`, `Product` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 3`** (18 nodes): `.validate()`, `.order()`, `.findById()`, `ProductsResolver`, `.constructor()`, `.createProduct()`, `.product()`, `.products()`, `.updateStock()`, `ProductsService`, `.constructor()`, `.create()`, `.decrementStock()`, `.findAll()`, `.findById()`, `.updateStock()`, `products.resolver.ts`, `products.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (8 nodes): `HealthController`, `.check()`, `.constructor()`, `.rabbitmqHealthIndicator()`, `HealthModule`, `.isHealthy()`, `health.controller.ts`, `health.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (4 nodes): `AppController`, `.constructor()`, `.getHello()`, `app.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (3 nodes): `AppService`, `.getHello()`, `app.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `AppModule`, `app.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `ProductsModule`, `products.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `update-stock.input.ts`, `UpdateStockInput`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `CreateProductInput`, `create-product.input.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `Product`, `product.entity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `AuthModule`, `auth.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `ESLint Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `Test Environment Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OrdersService` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `RabbitmqService` connect `Community 1` to `Community 9`, `Community 4`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `UsersService` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `OrdersService` (e.g. with `OrdersConsumer` and `ProcessedMessage`) actually correct?**
  _`OrdersService` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AppModule`, `ProductsModule`, `UpdateStockInput` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._