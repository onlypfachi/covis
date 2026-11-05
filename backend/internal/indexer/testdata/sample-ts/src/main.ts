import { Controller, PaymentService } from './payments';
import * as http from './http/server';

export function start() {
  const c = new Controller(new PaymentService());
  http.listen(3000);
  return c.create({ body: { amount: 1, currency: 'usd' } });
}
