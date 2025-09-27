// Usage analytics entity for tracking tenant and user metrics
export interface UsageAnalytics {
  id: string;
  tenantId: string;
  userId?: string;
  metric: string;
  value: number;
  timestamp: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum AnalyticsMetric {
  USER_LOGIN = 'user_login',
  USER_SIGNUP = 'user_signup',
  API_CALL = 'api_call',
  FILE_UPLOAD = 'file_upload',
  FILE_DOWNLOAD = 'file_download',
  STORAGE_USAGE = 'storage_usage',
  ACTIVE_USERS = 'active_users',
  FEATURE_USAGE = 'feature_usage'
}

// Analytics aggregate interface for reporting
export interface AnalyticsAggregate {
  id: string;
  tenantId: string;
  metric: AnalyticsMetric;
  aggregationType: 'sum' | 'count' | 'average' | 'max' | 'min';
  value: number;
  period: 'hour' | 'day' | 'week' | 'month';
  timestamp: Date;
  createdAt: Date;
}
