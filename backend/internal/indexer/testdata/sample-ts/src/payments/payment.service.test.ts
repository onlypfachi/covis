import { describe, it, expect } from 'vitest';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  it('rejects non-positive amounts', async () => {
    await expect(new PaymentService().charge(0, 'usd')).rejects.toThrow();
  });
});
