export interface CustomerDto {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: number;
}

export interface CustomerMemoryDto {
  id: string;
  customerId: string;
  category: string;
  fact: string;
  value: string;
  confidence: number;
  createdAt: number;
}
