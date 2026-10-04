/** State returned by the billing Server Actions; they redirect to Stripe on success. */
export type BillingActionState = { error?: string };

export const initialBillingState: BillingActionState = {};
