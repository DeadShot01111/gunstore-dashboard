import { supabase } from "@/lib/supabase/client";

export type CraftRecipeRecord = {
  id?: string;
  itemName: string;
  yieldPerCraft: number;
  titanium: number;
  scrap: number;
  steel: number;
  plastic: number;
  aluminum: number;
  rubber: number;
  electronics: number;
  glass: number;
  gunpowder: number;
};

type DbCraftRecipeRow = {
  id: string;
  item_name: string;
  yield_per_craft: number | null;
  titanium: number | null;
  scrap: number | null;
  steel: number | null;
  plastic: number | null;
  aluminum: number | null;
  rubber: number | null;
  electronics: number | null;
  glass: number | null;
  gunpowder: number | null;
};

function sanitizeNumber(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(numericValue, 0);
}

function toCraftRecipeRecord(row: DbCraftRecipeRow): CraftRecipeRecord {
  return {
    id: row.id,
    itemName: row.item_name,
    yieldPerCraft: Math.max(sanitizeNumber(row.yield_per_craft), 1),
    titanium: sanitizeNumber(row.titanium),
    scrap: sanitizeNumber(row.scrap),
    steel: sanitizeNumber(row.steel),
    plastic: sanitizeNumber(row.plastic),
    aluminum: sanitizeNumber(row.aluminum),
    rubber: sanitizeNumber(row.rubber),
    electronics: sanitizeNumber(row.electronics),
    glass: sanitizeNumber(row.glass),
    gunpowder: sanitizeNumber(row.gunpowder),
  };
}

export async function getCraftRecipesFromSupabase(): Promise<CraftRecipeRecord[]> {
  const { data, error } = await supabase
    .from("craft_item_requirements")
    .select("*")
    .order("item_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbCraftRecipeRow[]).map(toCraftRecipeRecord);
}

export async function upsertCraftRecipeInSupabase(recipe: CraftRecipeRecord) {
  const payload = {
    item_name: recipe.itemName.trim(),
    yield_per_craft: Math.max(sanitizeNumber(recipe.yieldPerCraft), 1),
    titanium: sanitizeNumber(recipe.titanium),
    scrap: sanitizeNumber(recipe.scrap),
    steel: sanitizeNumber(recipe.steel),
    plastic: sanitizeNumber(recipe.plastic),
    aluminum: sanitizeNumber(recipe.aluminum),
    rubber: sanitizeNumber(recipe.rubber),
    electronics: sanitizeNumber(recipe.electronics),
    glass: sanitizeNumber(recipe.glass),
    gunpowder: sanitizeNumber(recipe.gunpowder),
  };

  const { error } = await supabase
    .from("craft_item_requirements")
    .upsert(payload, { onConflict: "item_name" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCraftRecipeInSupabase(itemName: string) {
  const { error } = await supabase
    .from("craft_item_requirements")
    .delete()
    .eq("item_name", itemName.trim());

  if (error) {
    throw new Error(error.message);
  }
}
