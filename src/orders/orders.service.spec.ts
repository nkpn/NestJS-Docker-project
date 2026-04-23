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

const mockQueryRunner = {
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  manager: {
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
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
        { provide: 'PROM_METRIC_ORDERS_CREATED_TOTAL', useFactory: mockCounter },
        { provide: 'PROM_METRIC_ORDERS_PROCESSED_TOTAL', useFactory: mockCounter },
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
    const product = { id: 'prod-uuid', name: 'Test Product', price: 50, stock: 10 };

    it('creates order when stock is sufficient', async () => {
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(product);
      (mockQueryRunner.manager.create as jest.Mock).mockReturnValue({
        userId,
        items: [],
        status: OrderStatus.PENDING,
        totalAmount: 100,
      });
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue({
        id: 'order-uuid',
        userId,
        status: OrderStatus.PENDING,
        totalAmount: 100,
      });

      const result = await service.createOrder(userId, input);

      expect(result.status).toBe(OrderStatus.PENDING);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('returns existing order for duplicate idempotency key', async () => {
      const existingOrder = {
        id: 'existing-uuid',
        status: OrderStatus.PENDING,
        idempotencyKey: 'dup-key',
      };
      ordersRepo.findOne.mockResolvedValue(existingOrder as any);

      const result = await service.createOrder(userId, {
        ...input,
        idempotencyKey: 'dup-key',
      });

      expect(result).toEqual(existingOrder);
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when stock is insufficient', async () => {
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue({
        ...product,
        stock: 1,
      });

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when product does not exist', async () => {
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('rolls back transaction on unexpected error', async () => {
      (mockQueryRunner.manager.findOne as jest.Mock).mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        'DB connection lost',
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // processOrder
  // ──────────────────────────────────────────────────────────
  describe('processOrder', () => {
    it('transitions PENDING order to COMPLETED', async () => {
      (mockQueryRunner.manager.insert as jest.Mock).mockResolvedValue(undefined);
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue({
        id: 'order-uuid',
        status: OrderStatus.PENDING,
      });
      (mockQueryRunner.manager.update as jest.Mock).mockResolvedValue({
        affected: 1,
      });

      await service.processOrder('order-uuid', 'msg-uuid');

      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Order,
        'order-uuid',
        expect.objectContaining({ status: OrderStatus.COMPLETED }),
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('silently skips duplicate messageId (idempotency)', async () => {
      (mockQueryRunner.manager.insert as jest.Mock).mockRejectedValue({
        code: '23505',
      });

      await expect(
        service.processOrder('order-uuid', 'dup-msg'),
      ).resolves.toBeUndefined();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();
    });

    it('skips already non-PENDING orders without updating', async () => {
      (mockQueryRunner.manager.insert as jest.Mock).mockResolvedValue(undefined);
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue({
        id: 'order-uuid',
        status: OrderStatus.COMPLETED,
      });

      await service.processOrder('order-uuid', 'msg-uuid');

      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('throws and rolls back for unknown order', async () => {
      (mockQueryRunner.manager.insert as jest.Mock).mockResolvedValue(undefined);
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.processOrder('unknown-id', 'msg-uuid'),
      ).rejects.toThrow(NotFoundException);
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────
  // findById
  // ──────────────────────────────────────────────────────────
  describe('findById', () => {
    it('returns order when found', async () => {
      const order = { id: 'order-uuid', status: OrderStatus.PENDING };
      ordersRepo.findOne.mockResolvedValue(order as any);

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
