export { 
  UsageAnalytics, 
  AnalyticsMetric 
} from '@prisma/client';

// Analytics aggregate interface for reporting (extended)
export interface AnalyticsAggregateExtended {
  id: string;
  tenantId: string;
  metricType: string;
  metricValue: number;
  aggregationType: 'sum' | 'count' | 'average' | 'max' | 'min';
  period: 'hour' | 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}