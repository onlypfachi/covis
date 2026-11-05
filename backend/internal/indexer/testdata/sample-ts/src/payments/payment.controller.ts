import { PaymentService } from './payment.service';
import type { Request } from '../http/types';

export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  async create(req: Request) {
    const amount = parseAmount(req.body.amount);
    return this.payments.charge(amount, req.body.currency);
  }
}

function parseAmount(raw: unknown): number {
  return Number(raw);
}
