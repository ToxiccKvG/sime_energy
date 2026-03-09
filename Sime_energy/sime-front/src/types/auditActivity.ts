export interface AuditActivity {
  id: string;
  auditId: string;
  type: 'invoice' | 'measure' | 'inventory' | 'action' | 'annotation' | 'validation' | 'system';
  title: string;
  description: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: string;
  metadata?: {
    invoiceCount?: number;
    equipmentCount?: number;
    siteId?: string;
    attachments?: string[];
    [key: string]: any;
  };
}

export interface AuditAction {
  id: string;
  auditId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;
  assignedToName?: string;
  dueDate?: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  completedAt?: string;
  attachments?: string[];
  comments?: AuditActionComment[];
}

export interface AuditActionComment {
  id: string;
  actionId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
}

export interface AuditInvoiceStats {
  total: number;
  uploaded: number;
  processed: number;
  verified: number;
  totalAmount: number;
  averageConfidence: number;
}

export interface AuditMeasureStats {
  totalSensors: number;
  activeSensors: number;
  measurementCount: number;
  lastMeasurementDate?: string;
}

export interface AuditInventoryStats {
  totalSites: number;
  totalBuildings: number;
  totalFloors: number;
  totalRooms: number;
  totalEquipment: number;
}
