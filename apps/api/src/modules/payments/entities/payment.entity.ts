// Payment entities using Stripe models
// For now, these are interfaces since payments are handled through Stripe API
export interface Payment {
  id: string;
  stripePaymentIntentId: string;
  tenantId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethod {
  id: string;
  stripePaymentMethodId: string;
  tenantId: string;
  type: 'card' | 'bank_account' | 'sepa_debit';
  isDefault: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
