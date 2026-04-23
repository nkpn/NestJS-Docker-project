import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

const mockOrdersRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockRabbitmqService = () => ({
  publish: jest.fn().mockResolvedValue(undefined),
});

const mockQueryBuilder = {
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected: 1 }),
};

const connectMock = jest.fn().mockResolvedValue(undefined);
const startTransactionMock = jest.fn().mockResolvedValue(undefined);
const commitTransactionMock = jest.fn().mockResolvedValue(undefined);
const rollbackTransactionMock = jest.fn().mockResolvedValue(undefined);
const releaseMock = jest.fn().mockResolvedValue(undefined);

const managerCreateQueryBuilderMock = jest
  .fn()
  .mockReturnValue(mockQueryBuilder);
const managerCreateMock = jest.fn();
const managerSaveMock = jest.fn();
const managerFindOneMock = jest.fn();
const managerInsertMock = jest.fn();
const managerUpdateMock = jest.fn();

const mockQueryRunner = {
  connect: connectMock,
  startTransaction: startTransactionMock,
  commitTransaction: commitTransactionMock,
  rollbackTransaction: rollbackTransactionMock,
  release: releaseMock,
  manager: {
    createQueryBuilder: managerCreateQueryBuilderMock,
    create: managerCreateMock,
    save: managerSaveMock,
    findOne: managerFindOneMock,
    insert: managerInsertMock,
    update: managerUpdateMock,
  },
} as unknown as QueryRunner;

const mockDataSource = () => ({
  createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
});

const mockCounterInc = jest.fn();
const mockCounter = () => ({ inc: mockCounterInc });

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: jest.Mocked<Repository<Order>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useFactory: mockOrdersRepo },
        { provide: RabbitmqService, useFactory: mockRabbitmqService },
        { provide: DataSource, useFactory: mockDataSource },
        {
          provide: 'PROM_METRIC_ORDERS_CREATED_TOTAL',
          useFactory: mockCounter,
        },
        {
          provide: 'PROM_METRIC_ORDERS_PROCESSED_TOTAL',
          useFactory: mockCounter,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Order));
  });

  afterEach(() => jest.clearAllMocks());

  // ──────────────────────────────────────────────────────────
  // createOrder
  // ──────────────────────────────────────────────────────────
  describe('createOrder', () => {
    const userId = 'user-uuid';
    const input = { items: [{ productId: 'prod-uuid', quantity: 2 }] };
    const product = {
      id: 'prod-uuid',
      name: 'Test Product',
      price: 50,
      stock: 10,
    };

    it('creates order when stock is sufficient', async () => {
      managerFindOneMock.mockResolvedValue(product);
      managerCreateMock.mockReturnValue({
        userId,
        items: [],
        status: OrderStatus.PENDING,
        totalAmount: 100,
      });
      managerSaveMock.mockResolvedValue({
        id: 'order-uuid',
        userId,
        status: OrderStatus.PENDING,
        totalAmount: 100,
      });

      const result = await service.createOrder(userId, input);

      expect(result.status).toBe(OrderStatus.PENDING);
      expect(commitTransactionMock).toHaveBeenCalled();
    });

    it('returns existing order for duplicate idempotency key', async () => {
      const existingOrder = {
        id: 'existing-uuid',
        userId,
        items: [],
        status: OrderStatus.PENDING,
        totalAmount: 0,
        idempotencyKey: 'dup-key',
        processedAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      ordersRepo.findOne.mockResolvedValue(existingOrder as Order);

      const result = await service.createOrder(userId, {
        ...input,
        idempotencyKey: 'dup-key',
      });

      expect(result).toEqual(existingOrder);
      expect(startTransactionMock).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when stock is insufficient', async () => {
      managerFindOneMock.mockResolvedValue({
        ...product,
        stock: 1,
      });

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        ForbiddenException,
      );
      expect(rollbackTransactionMock).toHaveBeenCalled();
    });

    it('throws NotFoundException when product does not exist', async () => {
      managerFindOneMock.mockResolvedValue(null);

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        NotFoundException,
      );
      expect(rollbackTransactionMock).toHaveBeenCalled();
    });

    it('rolls back transaction on unexpected error', async () => {
      managerFindOneMock.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        'DB connection lost',
      );
      expect(rollbackTransactionMock).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // processOrder
  // ──────────────────────────────────────────────────────────
  describe('processOrder', () => {
    it('transitions PENDING order to COMPLETED', async () => {
      managerInsertMock.mockResolvedValue(undefined);
      managerFindOneMock.mockResolvedValue({
        id: 'order-uuid',
        status: OrderStatus.PENDING,
      });
      managerUpdateMock.mockResolvedValue({
        affected: 1,
      });

      await service.processOrder('order-uuid', 'msg-uuid');

      expect(managerUpdateMock).toHaveBeenCalledWith(
        Order,
        'order-uuid',
        expect.objectContaining({ status: OrderStatus.COMPLETED }),
      );
      expect(commitTransactionMock).toHaveBeenCalled();
    });

    it('silently skips duplicate messageId (idempotency)', async () => {
      managerInsertMock.mockRejectedValue({
        code: '23505',
      });

      await expect(
        service.processOrder('order-uuid', 'dup-msg'),
      ).resolves.toBeUndefined();
      expect(rollbackTransactionMock).toHaveBeenCalled();
      expect(managerUpdateMock).not.toHaveBeenCalled();
    });

    it('skips already non-PENDING orders without updating', async () => {
      managerInsertMock.mockResolvedValue(undefined);
      managerFindOneMock.mockResolvedValue({
        id: 'order-uuid',
        status: OrderStatus.COMPLETED,
      });

      await service.processOrder('order-uuid', 'msg-uuid');

      expect(managerUpdateMock).not.toHaveBeenCalled();
      expect(commitTransactionMock).toHaveBeenCalled();
    });

    it('throws and rolls back for unknown order', async () => {
      managerInsertMock.mockResolvedValue(undefined);
      managerFindOneMock.mockResolvedValue(null);

      await expect(
        service.processOrder('unknown-id', 'msg-uuid'),
      ).rejects.toThrow(NotFoundException);
      expect(rollbackTransactionMock).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // findById
  // ──────────────────────────────────────────────────────────
  describe('findById', () => {
    it('returns order when found', async () => {
      const order = {
        id: 'order-uuid',
        userId: 'user-uuid',
        items: [],
        status: OrderStatus.PENDING,
        totalAmount: 0,
        idempotencyKey: null,
        processedAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      ordersRepo.findOne.mockResolvedValue(order as Order);

      const result = await service.findById('order-uuid');
      expect(result).toEqual(order);
    });

    it('throws NotFoundException when order not found', async () => {
      ordersRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
