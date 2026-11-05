export interface PaymentProcessor {
  charge(amount: number, currency: string): Promise<unknown>;
}
