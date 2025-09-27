// Bulk import job status enum
export enum BulkImportJobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// Bulk import job entity (extend as needed based on your requirements)
export interface BulkImportJob {
  id: string;
  fileName: string;
  originalFileName: string;
  status: BulkImportJobStatus;
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  errors: string[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  tenantId: string;
}
