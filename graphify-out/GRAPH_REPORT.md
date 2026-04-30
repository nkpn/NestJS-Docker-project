# Graph Report - .  (2026-04-29)

## Corpus Check
- Corpus is ~9,720 words - fits in a single context window. You may not need a graph.

## Summary
- 240 nodes · 317 edges · 22 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Order Domain & DTOs|Order Domain & DTOs]]
- [[_COMMUNITY_Messaging & Utilities|Messaging & Utilities]]
- [[_COMMUNITY_Auth Service Layer|Auth Service Layer]]
- [[_COMMUNITY_Products & Query Layer|Products & Query Layer]]
- [[_COMMUNITY_Auth Module|Auth Module]]
- [[_COMMUNITY_App Bootstrap & Config|App Bootstrap & Config]]
- [[_COMMUNITY_E2E Test Helpers|E2E Test Helpers]]
- [[_COMMUNITY_GraphQL Error Handling|GraphQL Error Handling]]
- [[_COMMUNITY_Auth Resolver|Auth Resolver]]
- [[_COMMUNITY_Health & Monitoring|Health & Monitoring]]
- [[_COMMUNITY_Authorization Guards|Authorization Guards]]
- [[_COMMUNITY_App Controller|App Controller]]
- [[_COMMUNITY_App Service|App Service]]
- [[_COMMUNITY_App Layer Tests|App Layer Tests]]
- [[_COMMUNITY_Root Module|Root Module]]
- [[_COMMUNITY_Products Module|Products Module]]
- [[_COMMUNITY_Stock Management DTOs|Stock Management DTOs]]
- [[_COMMUNITY_Product Creation DTOs|Product Creation DTOs]]
- [[_COMMUNITY_Product Entity|Product Entity]]
- [[_COMMUNITY_Auth Module Files|Auth Module Files]]
- [[_COMMUNITY_Linting Config|Linting Config]]
- [[_COMMUNITY_Test Setup|Test Setup]]

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

### Community 0 - "Order Domain & DTOs"
Cohesion: 0.09
Nodes (19): CreateOrderInput, Order, StoredOrderItem, OrderItemInput, OrderStatus Enum (PENDING/PROCESSING/COMPLETED/FAILED), OrdersConnection, PageInfo, OrdersFilterInput (+11 more)

### Community 1 - "Messaging & Utilities"
Cohesion: 0.08
Nodes (13): roundMoney(), roundMoney Unit Tests, buildOrderMessage(), OrderMessage Contract, parseOrderMessage(), OrdersConsumer, RabbitmqModule, MAX_RETRY_ATTEMPTS constant (+5 more)

### Community 2 - "Auth Service Layer"
Cohesion: 0.12
Nodes (7): AuthService, seedAdmin(), Role Enum (USER/ADMIN), User, UsersModule, UsersResolver, UsersService

### Community 3 - "Products & Query Layer"
Cohesion: 0.12
Nodes (2): ProductsResolver, ProductsService

### Community 4 - "Auth Module"
Cohesion: 0.16
Nodes (11): AuthResponse, AuthModule, AuthResolver, AuthService, Configuration Factory, CurrentUser Decorator, GqlAuthGuard, JwtPayload Interface (+3 more)

### Community 5 - "App Bootstrap & Config"
Cohesion: 0.21
Nodes (16): E2E Test Suite (Order Flow), AppModule (Root Module), resolveEnvFilePath (env-file.ts), envValidationSchema (Joi), Order Message Contract Test, CreateProductInput DTO, TypeORM CLI DataSource, E2E Test Helpers (+8 more)

### Community 6 - "E2E Test Helpers"
Cohesion: 0.33
Nodes (6): createOrder(), createProduct(), expectGraphqlSuccess(), gql(), loginUser(), registerUser()

### Community 7 - "GraphQL Error Handling"
Cohesion: 0.38
Nodes (8): GqlHttpExceptionFilter, getGraphqlCode(), getHttpExceptionMessage(), isRecord(), normalizeGraphqlError(), normalizeMessage(), graphql-error.utils Unit Tests, toGraphqlHttpError()

### Community 8 - "Auth Resolver"
Cohesion: 0.22
Nodes (3): AuthResolver, authService(), registerUser()

### Community 9 - "Health & Monitoring"
Cohesion: 0.25
Nodes (2): HealthController, HealthModule

### Community 10 - "Authorization Guards"
Cohesion: 0.33
Nodes (3): Roles(), ROLES_KEY constant, RolesGuard

### Community 13 - "App Controller"
Cohesion: 0.5
Nodes (1): AppController

### Community 14 - "App Service"
Cohesion: 0.67
Nodes (1): AppService

### Community 15 - "App Layer Tests"
Cohesion: 1.0
Nodes (3): AppController, AppController Unit Test, AppService

### Community 16 - "Root Module"
Cohesion: 1.0
Nodes (1): AppModule

### Community 17 - "Products Module"
Cohesion: 1.0
Nodes (1): ProductsModule

### Community 18 - "Stock Management DTOs"
Cohesion: 1.0
Nodes (1): UpdateStockInput

### Community 19 - "Product Creation DTOs"
Cohesion: 1.0
Nodes (1): CreateProductInput

### Community 20 - "Product Entity"
Cohesion: 1.0
Nodes (1): Product

### Community 22 - "Auth Module Files"
Cohesion: 1.0
Nodes (1): AuthModule

### Community 36 - "Linting Config"
Cohesion: 1.0
Nodes (1): ESLint Config

### Community 37 - "Test Setup"
Cohesion: 1.0
Nodes (1): Test Environment Setup

## Knowledge Gaps
- **18 isolated node(s):** `AppModule`, `ProductsModule`, `UpdateStockInput`, `CreateProductInput`, `Product` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Products & Query Layer`** (18 nodes): `.validate()`, `.order()`, `.findById()`, `ProductsResolver`, `.constructor()`, `.createProduct()`, `.product()`, `.products()`, `.updateStock()`, `ProductsService`, `.constructor()`, `.create()`, `.decrementStock()`, `.findAll()`, `.findById()`, `.updateStock()`, `products.resolver.ts`, `products.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Health & Monitoring`** (8 nodes): `HealthController`, `.check()`, `.constructor()`, `.rabbitmqHealthIndicator()`, `HealthModule`, `.isHealthy()`, `health.controller.ts`, `health.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Controller`** (4 nodes): `AppController`, `.constructor()`, `.getHello()`, `app.controller.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Service`** (3 nodes): `AppService`, `.getHello()`, `app.service.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Root Module`** (2 nodes): `AppModule`, `app.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Products Module`** (2 nodes): `ProductsModule`, `products.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stock Management DTOs`** (2 nodes): `update-stock.input.ts`, `UpdateStockInput`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Product Creation DTOs`** (2 nodes): `CreateProductInput`, `create-product.input.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Product Entity`** (2 nodes): `Product`, `product.entity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Module Files`** (2 nodes): `AuthModule`, `auth.module.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Linting Config`** (1 nodes): `ESLint Config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Setup`** (1 nodes): `Test Environment Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OrdersService` connect `Order Domain & DTOs` to `Messaging & Utilities`, `Auth Service Layer`, `Products & Query Layer`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `RabbitmqService` connect `Messaging & Utilities` to `Health & Monitoring`, `Auth Module`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `UsersService` connect `Auth Service Layer` to `Order Domain & DTOs`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `OrdersService` (e.g. with `OrdersConsumer` and `ProcessedMessage`) actually correct?**
  _`OrdersService` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AppModule`, `ProductsModule`, `UpdateStockInput` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Order Domain & DTOs` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Messaging & Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._