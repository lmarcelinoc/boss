// Tenant feature flags
export enum TenantFeature {
  ANALYTICS = 'ANALYTICS',
  BILLING = 'BILLING',
  CUSTOM_DOMAINS = 'CUSTOM_DOMAINS',
  API_ACCESS = 'API_ACCESS',
  TEAM_MANAGEMENT = 'TEAM_MANAGEMENT',
  ADVANCED_REPORTING = 'ADVANCED_REPORTING',
  WHITE_LABELING = 'WHITE_LABELING',
  SSO = 'SSO',
  AUDIT_LOGS = 'AUDIT_LOGS'
}

export interface TenantFeatureFlag {
  id: string;
  tenantId: string;
  feature: TenantFeature;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
