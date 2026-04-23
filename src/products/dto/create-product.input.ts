import { InputType, Field, Float, Int } from '@nestjs/graphql';
import {
  IsString,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateProductInput {
  @Field()
  @IsString()
  @MinLength(2)
  name: string;

  @Field({ nullable: true })
  @IsString()
  description?: string;

  @Field(() => Float)
  @IsNumber()
  @IsPositive()
  price: number;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  stock: number;
}
