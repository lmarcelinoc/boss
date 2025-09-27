// Import error entity
export interface ImportError {
  id: string;
  bulkImportJobId: string;
  rowNumber: number;
  field: string;
  error: string;
  value?: string;
  createdAt: Date;
}
