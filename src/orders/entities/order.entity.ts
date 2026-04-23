import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { OrderStatus } from '../enums/order-status.enum';

@ObjectType()
class StoredOrderItem {
  @Field(() => ID)
  productId: string;

  @Field()
  productName: string;

  @Field(() => Float)
  price: number;

  @Field(() => Int)
  quantity: number;
}

@ObjectType()
@Entity('orders')
@Index('idx_orders_status_created_at', ['status', 'createdAt'])
export class Order {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => ID)
  @Index('idx_orders_user_id')
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Field(() => [StoredOrderItem])
  @Column('jsonb')
  items: StoredOrderItem[];

  @Field(() => OrderStatus)
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Field(() => Float)
  @Column('decimal', { precision: 10, scale: 2 })
  totalAmount: number;

  @Field(() => String, { nullable: true })
  @Index('idx_orders_idempotency_key', { unique: true, sparse: true })
  @Column({ type: 'text', unique: true, nullable: true, default: null })
  idempotencyKey: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Field(() => Date)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => Date)
  @UpdateDateColumn()
  updatedAt: Date;
}
