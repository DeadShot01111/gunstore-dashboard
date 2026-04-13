export type VipMode = "none" | "percent" | "fixed";

export type CatalogProduct = {
  name: string;
  price: number;
  category: string;
  vipMode?: VipMode;
  vipPercent?: number;
  vipFixedPrice?: number;
};

export type CartItem = CatalogProduct & {
  qty: number;
};

export type SavedOrderItem = {
  name: string;
  category: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type SavedOrder = {
  id: string;
  createdAt: string;
  employeeName: string;
  employeeEmail: string;
  role: string;
  vipEnabled: boolean;
  items: SavedOrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  status?: string;
  notes?: string;
};