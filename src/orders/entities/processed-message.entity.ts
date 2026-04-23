import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('processed_messages')
export class ProcessedMessage {
  @PrimaryColumn({ type: 'text' })
  messageId: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'timestamptz' })
  processedAt: Date;
}
