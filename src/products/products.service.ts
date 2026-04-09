import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductInput } from './dto/create-product.input';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  async create(input: CreateProductInput): Promise<Product> {
    const product = this.productsRepo.create({
      ...input,
      description: input.description ?? '',
    });
    return this.productsRepo.save(product);
  }

  async updateStock(productId: string, stock: number): Promise<Product> {
    const product = await this.findById(productId);
    product.stock = stock;
    return this.productsRepo.save(product);
  }

  async decrementStock(
    productId: string,
    quantity: number,
  ): Promise<Product> {
    const product = await this.findById(productId);
    if (product.stock < quantity) {
      throw new Error(
        `Insufficient stock for product "${product.name}": requested ${quantity}, available ${product.stock}`,
      );
    }
    product.stock -= quantity;
    return this.productsRepo.save(product);
  }
}
