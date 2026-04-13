export const materialOptions = [
  "Recyclables",
  "Sulfur",
  "Titanium",
  "Charcoal",
] as const;

export type MaterialType = (typeof materialOptions)[number];
export type ReimbursementStatus = "Paid" | "Unpaid";

export type MaterialPurchase = {
  id: string;
  createdAt: string;
  material: MaterialType;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  purchasedBy?: string;
  reimbursementStatus: ReimbursementStatus;
  notes?: string;
};

const STORAGE_KEY = "gunstore_material_purchases";

export function getStoredMaterialPurchases(): MaterialPurchase[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as MaterialPurchase[];

    return Array.isArray(parsed)
      ? parsed.map((item) => ({
          ...item,
          purchasedBy: item.purchasedBy ?? "",
          reimbursementStatus: item.reimbursementStatus ?? "Unpaid",
          notes: item.notes ?? "",
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveStoredMaterialPurchases(purchases: MaterialPurchase[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(purchases));
}