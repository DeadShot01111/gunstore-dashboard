import { supabase } from "@/lib/supabase/client";
import { CatalogProduct } from "./types";
import { parseGunstoreDate } from "./week";

export type AmmoPromotion = {
  id: string;
  name: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
};

type DbAmmoPromotionRow = {
  id: string;
  name: string;
  discount_percent: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function toAmmoPromotion(row: DbAmmoPromotionRow): AmmoPromotion {
  return {
    id: row.id,
    name: row.name,
    discountPercent: Number(row.discount_percent ?? 0),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isAmmoPromotionEligibleProduct(
  product: Pick<CatalogProduct, "category" | "name">
) {
  const normalizedCategory = normalizeText(product.category);
  const normalizedName = normalizeText(product.name);

  return normalizedCategory === "ammo" || normalizedName.includes("ammo");
}

export function isAmmoPromotionActiveAt(
  promotion: Pick<AmmoPromotion, "active" | "startsAt" | "endsAt">,
  at: string | Date = new Date()
) {
  if (!promotion.active) return false;

  const instant = parseGunstoreDate(at).getTime();
  const startsAt = parseGunstoreDate(promotion.startsAt).getTime();
  const endsAt = parseGunstoreDate(promotion.endsAt).getTime();

  return instant >= startsAt && instant <= endsAt;
}

export function getApplicableAmmoPromotion(
  product: Pick<CatalogProduct, "category" | "name">,
  promotions: AmmoPromotion[],
  at: string | Date = new Date()
) {
  if (!isAmmoPromotionEligibleProduct(product)) {
    return null;
  }

  return (
    promotions
      .filter((promotion) => isAmmoPromotionActiveAt(promotion, at))
      .sort((a, b) => {
        const discountDiff =
          Number(b.discountPercent ?? 0) - Number(a.discountPercent ?? 0);

        if (discountDiff !== 0) {
          return discountDiff;
        }

        return (
          parseGunstoreDate(b.startsAt).getTime() -
          parseGunstoreDate(a.startsAt).getTime()
        );
      })[0] ?? null
  );
}

export async function getAmmoPromotionsFromSupabase(): Promise<AmmoPromotion[]> {
  const { data, error } = await supabase
    .from("ammo_promotions")
    .select("*")
    .order("starts_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbAmmoPromotionRow[]).map(toAmmoPromotion);
}

export async function upsertAmmoPromotionInSupabase(
  promotion: Omit<AmmoPromotion, "createdAt" | "updatedAt"> & { id?: string }
) {
  const payload = {
    id: promotion.id,
    name: promotion.name,
    discount_percent: Number(promotion.discountPercent ?? 0),
    starts_at: promotion.startsAt,
    ends_at: promotion.endsAt,
    active: promotion.active,
  };

  const { data, error } = await supabase
    .from("ammo_promotions")
    .upsert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save ammo promotion.");
  }

  return toAmmoPromotion(data as DbAmmoPromotionRow);
}

export async function setAmmoPromotionActiveInSupabase(
  promotionId: string,
  active: boolean
) {
  const { data, error } = await supabase
    .from("ammo_promotions")
    .update({ active })
    .eq("id", promotionId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update ammo promotion.");
  }

  return toAmmoPromotion(data as DbAmmoPromotionRow);
}

export async function deleteAmmoPromotionInSupabase(promotionId: string) {
  const { error } = await supabase
    .from("ammo_promotions")
    .delete()
    .eq("id", promotionId);

  if (error) {
    throw new Error(error.message);
  }
}
