import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { ProductsService } from '../products/products.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

const mockOrdersRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockProductsService = () => ({
  findById: jest.fn(),
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
  let productsService: jest.Mocked<ReturnType<typeof mockProductsService>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useFactory: mockOrdersRepo },
        { provide: ProductsService, useFactory: mockProductsService },
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
    productsService = module.get(ProductsService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createOrder', () => {
    const userId = 'user-uuid';
    const input = {
      items: [{ productId: 'prod-uuid', quantity: 2 }],
    };
    const product = {
      id: 'prod-uuid',
      name: 'Test Product',
      price: 50.0,
      stock: 10,
    };

    it('creates order when stock is sufficient', async () => {
      productsService.findById.mockResolvedValue(product as any);
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

    it('throws ForbiddenException when stock is insufficient', async () => {
      productsService.findById.mockResolvedValue({
        ...product,
        stock: 1,
      } as any);

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('rolls back transaction on error', async () => {
      productsService.findById.mockRejectedValue(
        new NotFoundException('Product not found'),
      );

      await expect(service.createOrder(userId, input)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('processOrder', () => {
    it('transitions PENDING order to COMPLETED', async () => {
      ordersRepo.findOne.mockResolvedValue({
        id: 'order-uuid',
        status: OrderStatus.PENDING,
      } as any);
      ordersRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.processOrder('order-uuid');

      expect(ordersRepo.update).toHaveBeenCalledWith('order-uuid', {
        status: OrderStatus.PROCESSING,
      });
      expect(ordersRepo.update).toHaveBeenCalledWith(
        'order-uuid',
        expect.objectContaining({ status: OrderStatus.COMPLETED }),
      );
    });

    it('skips already processed orders', async () => {
      ordersRepo.findOne.mockResolvedValue({
        id: 'order-uuid',
        status: OrderStatus.COMPLETED,
      } as any);

      await service.processOrder('order-uuid');

      expect(ordersRepo.update).not.toHaveBeenCalled();
    });
  });

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
