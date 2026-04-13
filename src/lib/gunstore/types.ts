export type VipMode = "none" | "percent" | "fixed";

export type CatalogCategory =
  | "Ammo"
  | "Weapons"
  | "Attachments"
  | "Misc Items"
  | "All";

export type CatalogProduct = {
  name: string;
  category: string;
  price: number;

  // manager-only margin field
  cost?: number;

  // VIP pricing
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

  // hidden internal cost/profit data
  unitCost?: number;
  unitProfit?: number;
  totalProfit?: number;
};

export type SavedOrderStatus =
  | "Completed"
  | "Edited"
  | "Pending Review";

export type SavedOrder = {
  id: string;
  createdAt: string;
  employeeName: string;
  employeeEmail?: string;
  role?: string;
  vipEnabled: boolean;

  items: SavedOrderItem[];

  subtotal: number;
  discount: number;
  total: number;

  // order-level profit summary
  totalProfit?: number;

  status?: SavedOrderStatus;
  notes?: string;
};