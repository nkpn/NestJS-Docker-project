# Manual Production Smoke

This checklist is for a deployed environment and does not rely on test scripts.
Use it to verify availability, observability, access control, and the full order flow.

## 1. Health check

Open:

- `https://nestjs-docker-project.onrender.com/health`

Expected result:

- response is `ok`
- database and RabbitMQ checks are healthy

## 2. Metrics

Open:

- `https://nestjs-docker-project.onrender.com/metrics`

Look for:

- `orders_created_total`
- `orders_processed_total{status="completed"}`
- `orders_processed_total{status="failed"}`

What to verify:

- the counters exist
- the values increase after you create and process an order

## 3. Logs

Open the Render service logs and look for:

- `Order created`
- `published messageId=...`
- `Processing order ...`
- `result=success`
- `result=retry`
- `result=dlq`
- `Order ... -> COMPLETED`
- `Order ... -> FAILED`

## 4. GraphQL browser flow

Open:

- `https://nestjs-docker-project.onrender.com/graphql`

Perform the flow in this order.

### 4.1 Register a user

```graphql
mutation Register($input: RegisterInput!) {
  register(input: $input) {
    accessToken
    user {
      id
      email
      role
    }
  }
}
```

Variables:

```json
{
  "input": {
    "email": "buyer@example.com",
    "name": "Buyer",
    "password": "secret123"
  }
}
```

Expected result:

- a JWT access token
- a user object with `role = USER`

### 4.2 Login with the same user

```graphql
mutation Login($input: LoginInput!) {
  login(input: $input) {
    accessToken
  }
}
```

Variables:

```json
{
  "input": {
    "email": "buyer@example.com",
    "password": "secret123"
  }
}
```

Expected result:

- another valid JWT token

### 4.3 Create a product as admin

Use an admin token in the `Authorization` header:

- `Authorization: Bearer <admin-access-token>`

```graphql
mutation CreateProduct($input: CreateProductInput!) {
  createProduct(input: $input) {
    id
    name
    price
    stock
  }
}
```

Variables:

```json
{
  "input": {
    "name": "Widget Pro",
    "description": "Production smoke product",
    "price": 29.99,
    "stock": 10
  }
}
```

Expected result:

- product id
- price and stock returned as saved

### 4.4 Create an order

Use the buyer token in the `Authorization` header:

- `Authorization: Bearer <buyer-access-token>`

```graphql
mutation CreateOrder($input: CreateOrderInput!) {
  createOrder(input: $input) {
    id
    status
    totalAmount
    idempotencyKey
    createdAt
  }
}
```

Variables:

```json
{
  "input": {
    "items": [
      {
        "productId": "<product-id>",
        "quantity": 2
      }
    ],
    "idempotencyKey": "smoke-order-001"
  }
}
```

Expected result:

- `status = PENDING` immediately after creation
- `totalAmount = 59.98` for the example above
- the order is persisted in the database

### 4.5 Re-query the order after background processing

Wait a few seconds and then run:

```graphql
query Order($id: ID!) {
  order(id: $id) {
    id
    status
    totalAmount
    processedAt
    failureReason
    items {
      productId
      productName
      price
      quantity
    }
  }
}
```

Variables:

```json
{
  "id": "<order-id>"
}
```

Expected result:

- `status = COMPLETED` for a successful run
- `processedAt` is filled in
- `failureReason` is empty

### 4.6 Check your own order history

```graphql
query MyOrders($pagination: OrdersPaginationInput) {
  myOrders(pagination: $pagination) {
    totalCount
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    nodes {
      id
      status
      totalAmount
      createdAt
    }
  }
}
```

Variables:

```json
{
  "pagination": {
    "limit": 10,
    "offset": 0
  }
}
```

Expected result:

- the created order appears in the list

## 5. Authorization checks

Run these negative checks to verify access control:

- call `createProduct` without an admin token
- call `orders` without any token
- call `order(id)` for another user’s order

Expected result:

- access is denied with a forbidden error

## 6. Quick evidence summary

If all of the above is visible, you have proof of:

- service health
- metrics exposure
- structured logs
- auth and role checks
- persistence
- async order processing
- repeatable business state retrieval
