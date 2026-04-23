import { randomUUID } from 'crypto';
import {
  buildOrderMessage,
  parseOrderMessage,
} from '../../src/orders/contracts/order-message.contract';

describe('Order message contract', () => {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('builds a valid queue payload for a newly created order', () => {
    const message = buildOrderMessage({
      orderId: randomUUID(),
      messageId: randomUUID(),
      createdAt: '2026-04-23T12:00:00.000Z',
    });

    expect(message.messageId).toMatch(uuidPattern);
    expect(message.orderId).toMatch(uuidPattern);
    expect(message.attempt).toBe(0);
    expect(message.createdAt).toBe('2026-04-23T12:00:00.000Z');
    expect(parseOrderMessage(message)).toEqual(message);
  });

  it('rejects malformed queue payloads before they reach the consumer', () => {
    expect(() =>
      parseOrderMessage({
        messageId: randomUUID(),
        orderId: randomUUID(),
        attempt: -1,
        createdAt: '2026-04-23T12:00:00.000Z',
      }),
    ).toThrow('Invalid order message contract');
  });
});
