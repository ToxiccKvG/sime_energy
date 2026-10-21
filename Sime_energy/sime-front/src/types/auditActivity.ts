export interface AuditInvoiceStats {
  total: number;
  uploaded: number;
  processed: number;
  verified: number;
  totalAmount: number;
  averageConfidence: number;
}

export interface AuditInventoryStats {
  totalSites: number;
  totalBuildings: number;
  totalFloors: number;
  totalRooms: number;
  totalEquipment: number;
}
