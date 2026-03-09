export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface OCRField {
  name: string;
  value: string;
  confidence: number;
  boundingBox: BoundingBox;
  modified: boolean;
  comment?: string;
}

export interface OCRResult {
  fields: OCRField[];
  pagesCount: number;
}

export type InvoiceStatus = 'to_verify' | 'in_progress' | 'verified' | 'validated';

export type InvoiceLabel = 'reel' | 'modifie' | 'estime' | 'errone_senelec' | 'remplace_supprime_annule';

export interface Invoice {
  id: string;
  auditId: string;
  auditName: string;
  fileName: string;
  pngPages: string[];
  type: 'pdf' | 'xlsx' | "xls"
  ocrResult: OCRResult;
  status: InvoiceStatus;
  label?: InvoiceLabel;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  amount?: number;
  invoiceDate?: string;
}

export interface Annotation {
  id: string;
  invoiceId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  userId: string;
  userName: string;
  timestamp: string;
  comment?: string;
}

export interface InvoiceGroup {
  id: string;
  name: string;
  invoiceIds: string[];
  assignedTo?: string;
  templateId?: string;
  status: 'draft' | 'in_progress' | 'validated';
  validatedAt?: string;
  createdAt: string;
}

export interface ExportTemplate {
  id: string;
  name: string;
  fields: string[];
  format: 'xlsx' | 'csv';
  mapping: Record<string, string>;
}
