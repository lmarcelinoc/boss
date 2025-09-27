export { Tenant } from '@prisma/client';

// Extended tenant interface with additional properties
export interface TenantWithPlan extends Tenant {
  plan?: string;
  features?: string[];
}
