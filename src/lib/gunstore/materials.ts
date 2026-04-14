import { supabase } from "@/lib/supabase/client";

export const materialOptions = [
  "Recyclables",
  "Titanium",
  "Sulfur",
  "Charcoal",
  "Other",
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

type DbMaterialPurchaseRow = {
  id: string;
  created_at: string;
  material: string;
  quantity: number;
  unit_price: number;
  total_cost: number;
  purchased_by: string | null;
  reimbursement_status: string;
  notes: string | null;
};

function toMaterialPurchase(row: DbMaterialPurchaseRow): MaterialPurchase {
  return {
    id: row.id,
    createdAt: row.created_at,
    material: row.material as MaterialType,
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    totalCost: Number(row.total_cost ?? 0),
    purchasedBy: row.purchased_by ?? "",
    reimbursementStatus: (row.reimbursement_status as ReimbursementStatus) ?? "Unpaid",
    notes: row.notes ?? "",
  };
}

export async function getMaterialPurchasesFromSupabase(): Promise<MaterialPurchase[]> {
  const { data, error } = await supabase
    .from("material_purchases")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbMaterialPurchaseRow[]).map(toMaterialPurchase);
}

export async function upsertMaterialPurchaseInSupabase(
  purchase: Omit<MaterialPurchase, "id"> & { id?: string }
) {
  const payload = {
    id: purchase.id,
    created_at: purchase.createdAt,
    material: purchase.material,
    quantity: Number(purchase.quantity ?? 0),
    unit_price: Number(purchase.unitPrice ?? 0),
    total_cost: Number(purchase.totalCost ?? 0),
    purchased_by: purchase.purchasedBy?.trim() || null,
    reimbursement_status: purchase.reimbursementStatus,
    notes: purchase.notes?.trim() || null,
  };

  const { error } = await supabase.from("material_purchases").upsert(payload);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteMaterialPurchaseInSupabase(id: string) {
  const { error } = await supabase
    .from("material_purchases")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
