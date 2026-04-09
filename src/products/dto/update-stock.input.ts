import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { IsUUID, IsInt, Min } from 'class-validator';

@InputType()
export class UpdateStockInput {
  @Field(() => ID)
  @IsUUID()
  productId: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  stock: number;
}
