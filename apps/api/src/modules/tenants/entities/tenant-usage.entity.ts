// Tenant usage metrics
export enum TenantUsageMetric {
  USERS = 'USERS',
  STORAGE = 'STORAGE',
  API_CALLS = 'API_CALLS',
  BANDWIDTH = 'BANDWIDTH',
  CUSTOM_FIELDS = 'CUSTOM_FIELDS'
}

export interface TenantUsage {
  id: string;
  tenantId: string;
  metric: TenantUsageMetric;
  value: number;
  period: Date;
  createdAt: Date;
  updatedAt: Date;
}
