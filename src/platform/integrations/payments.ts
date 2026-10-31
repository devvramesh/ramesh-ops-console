import { createHash } from "node:crypto";

export type RefundRequest = {
  /** Callers pass a stable key (for example the refund id) so a retry doesn't pay twice. */
  idempotencyKey: string;
  amountCents: number;
  currency: "USD";
  customerRef: string;
};

export type RefundResult = { processorRef: string; status: "succeeded" };

export interface PaymentProcessor {
  refund(req: RefundRequest): Promise<RefundResult>;
}

/** Fake processor. No network. The same idempotency key always returns the same reference. */
export class FakePaymentProcessor implements PaymentProcessor {
  private readonly seen = new Map<string, RefundResult>();

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
      throw new Error("amountCents must be a positive integer");
    }
    const existing = this.seen.get(req.idempotencyKey);
    if (existing) return existing;
    const digest = createHash("sha256").update(req.idempotencyKey).digest("hex").slice(0, 16);
    const result: RefundResult = { processorRef: `fake_${digest}`, status: "succeeded" };
    this.seen.set(req.idempotencyKey, result);
    return result;
  }
}

export const payments: PaymentProcessor = new FakePaymentProcessor();
