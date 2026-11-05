import { StripeGateway } from './stripe.gateway';
import { PaymentProcessor } from './types';

export class PaymentService implements PaymentProcessor {
  private gateway = new StripeGateway();

  /**
   * Charges the customer.
   * Amounts are in minor units.
   * @param amount - Amount to charge,
   *   in cents.
   * @param {string} [currency='usd'] ISO currency code
   * @returns The gateway's charge record.
   */
  async charge(amount: number, currency: string = 'usd', ...tags: string[]): Promise<unknown> {
    this.validate(amount);
    return this.gateway.createCharge({ amount, currency });
  }

  private validate(amount: number) {
    if (amount <= 0) throw new Error('invalid amount');
  }
}
