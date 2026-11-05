import Stripe from 'stripe';
import { BaseGateway } from '@lib/base-gateway';

export interface ChargeRequest {
  amount: number;
  currency: string;
}

export class StripeGateway extends BaseGateway {
  private client = new Stripe('sk_test');

  async createCharge(req: ChargeRequest) {
    this.log(`charging ${req.amount}`);
    return this.client.charges.create(req);
  }
}

export const toCents = (amount: number, rate?: number): number => Math.round(amount * (rate ?? 100));
