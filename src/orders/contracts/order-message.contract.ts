import Joi from 'joi';

export interface OrderMessage {
  messageId: string;
  orderId: string;
  attempt: number;
  createdAt: string;
}

const orderMessageSchema = Joi.object<OrderMessage>({
  messageId: Joi.string().uuid().required(),
  orderId: Joi.string().uuid().required(),
  attempt: Joi.number().integer().min(0).required(),
  createdAt: Joi.string().isoDate().required(),
})
  .required()
  .unknown(false)
  .prefs({ abortEarly: false, convert: false });

export function buildOrderMessage(input: {
  orderId: string;
  messageId: string;
  attempt?: number;
  createdAt?: string;
}): OrderMessage {
  return {
    orderId: input.orderId,
    messageId: input.messageId,
    attempt: input.attempt ?? 0,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function parseOrderMessage(value: unknown): OrderMessage {
  const validationResult = orderMessageSchema.validate(value);

  if (validationResult.error) {
    throw new Error(
      `Invalid order message contract: ${validationResult.error.message}`,
    );
  }

  return validationResult.value;
}
