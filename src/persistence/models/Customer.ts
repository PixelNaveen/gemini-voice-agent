export interface Customer {
  id: string;
  tenantId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}
