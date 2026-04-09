import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';
import { CreateProductInput } from './dto/create-product.input';
import { UpdateStockInput } from './dto/update-stock.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@Resolver(() => Product)
export class ProductsResolver {
  constructor(private readonly productsService: ProductsService) {}

  @Query(() => [Product], { description: 'List all products' })
  products(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @Query(() => Product, { description: 'Get product by ID' })
  product(@Args('id', { type: () => ID }) id: string): Promise<Product> {
    return this.productsService.findById(id);
  }

  @Mutation(() => Product, { description: 'Create a new product (admin only)' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  createProduct(
    @Args('input') input: CreateProductInput,
  ): Promise<Product> {
    return this.productsService.create(input);
  }

  @Mutation(() => Product, { description: 'Update product stock (admin only)' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateStock(
    @Args('input') input: UpdateStockInput,
  ): Promise<Product> {
    return this.productsService.updateStock(input.productId, input.stock);
  }
}
