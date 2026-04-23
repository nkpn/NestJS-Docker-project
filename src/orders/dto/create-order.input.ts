import { InputType, Field } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsOptional,
  IsString,
} from 'class-validator';
import { OrderItemInput } from './order-item.input';

@InputType()
export class CreateOrderInput {
  @Field(() => [OrderItemInput])
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items: OrderItemInput[];

  @Field(() => String, { nullable: true, description: 'Deduplicate retried mutations' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
