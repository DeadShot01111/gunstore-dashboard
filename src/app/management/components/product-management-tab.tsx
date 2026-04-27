"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteCraftRecipeInSupabase,
  getCraftRecipesFromSupabase,
  upsertCraftRecipeInSupabase,
} from "@/lib/gunstore/craft-recipes";
import { categories } from "@/lib/gunstore/catalog";
import {
  AmmoPromotion,
  deleteAmmoPromotionInSupabase,
  getAmmoPromotionsFromSupabase,
  isAmmoPromotionActiveAt,
  setAmmoPromotionActiveInSupabase,
  upsertAmmoPromotionInSupabase,
} from "@/lib/gunstore/promotions";
import { CatalogProduct, VipMode } from "@/lib/gunstore/types";
import {
  businessLocalDateTimeToIso,
  formatBusinessDateTime,
  toBusinessDateTimeLocalValue,
} from "@/lib/gunstore/week";
import { supabase } from "@/lib/supabase/client";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  vip_mode: VipMode;
  vip_percent: number | null;
  vip_fixed_price: number | null;
  active: boolean;
};

type ProductFormState = {
  name: string;
  category: string;
  price: number;
  cost: number;
  vipMode: VipMode;
  vipPercent: number;
  vipFixedPrice: number;
};

type AmmoPromotionFormState = {
  id?: string;
  name: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

function getEmptyForm(): ProductFormState {
  return {
    name: "",
    category: "Ammo",
    price: 0,
    cost: 0,
    vipMode: "none",
    vipPercent: 15,
    vipFixedPrice: 0,
  };
}

function getEmptyPromotionForm(): AmmoPromotionFormState {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);

  return {
    name: "Ammo Flash Sale",
    discountPercent: 50,
    startsAt: toBusinessDateTimeLocalValue(startsAt),
    endsAt: toBusinessDateTimeLocalValue(endsAt),
    active: true,
  };
}

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function getAmmoPromotionStatusLabel(promotion: AmmoPromotion) {
  if (!promotion.active) {
    return "Disabled";
  }

  if (isAmmoPromotionActiveAt(promotion)) {
    return "Live now";
  }

  if (new Date(promotion.startsAt).getTime() > Date.now()) {
    return "Scheduled";
  }

  return "Ended";
}

function isAmmoPromotionExpired(promotion: AmmoPromotion) {
  return new Date(promotion.endsAt).getTime() < Date.now();
}

function toCatalogProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    vipMode: row.vip_mode ?? "none",
    vipPercent: row.vip_percent ?? undefined,
    vipFixedPrice: row.vip_fixed_price ?? undefined,
  };
}

function getNormalUnitProfit(product: CatalogProduct) {
  return Math.max(Number(product.price ?? 0) - Number(product.cost ?? 0), 0);
}

function getVipUnitPrice(product: CatalogProduct) {
  if (product.vipMode === "fixed") {
    return Number(product.vipFixedPrice ?? product.price ?? 0);
  }

  if (product.vipMode === "percent") {
    const percent = Number(product.vipPercent ?? 15);
    return Math.round(Number(product.price ?? 0) * (1 - percent / 100));
  }

  return Number(product.price ?? 0);
}

function getVipUnitProfit(product: CatalogProduct) {
  return Math.max(getVipUnitPrice(product) - Number(product.cost ?? 0), 0);
}

type ProductManagementTabProps = {
  onCatalogChanged?: () => Promise<void> | void;
  onPromotionsChanged?: () => Promise<void> | void;
};

export default function ProductManagementTab({
  onCatalogChanged,
  onPromotionsChanged,
}: ProductManagementTabProps) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [originalProductNames, setOriginalProductNames] = useState<Record<string, string>>({});
  const [editingProductNameIds, setEditingProductNameIds] = useState<Set<string>>(
    () => new Set()
  );
  const [ammoPromotions, setAmmoPromotions] = useState<AmmoPromotion[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [saveMessage, setSaveMessage] = useState("");
  const [form, setForm] = useState<ProductFormState>(getEmptyForm());
  const [promotionForm, setPromotionForm] =
    useState<AmmoPromotionFormState>(getEmptyPromotionForm());
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [savingPromotion, setSavingPromotion] = useState(false);

  const showMessage = useCallback((message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 2500);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      showMessage(`Failed to load products: ${error.message}`);
      setLoading(false);
      return;
    }

    const loadedProducts = (data ?? []) as ProductRow[];

    setProducts(loadedProducts);
    setOriginalProductNames(
      Object.fromEntries(
        loadedProducts.map((product) => [product.id, product.name])
      )
    );
    setLoading(false);
  }, [showMessage]);

  const loadPromotions = useCallback(async () => {
    try {
      const loadedPromotions = await getAmmoPromotionsFromSupabase();
      setAmmoPromotions(loadedPromotions);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load ammo promotions.";
      showMessage(message);
    }
  }, [showMessage]);

  useEffect(() => {
    void loadProducts();
    void loadPromotions();
  }, [loadProducts, loadPromotions]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, search]);

  const orderedPromotions = useMemo(() => {
    return [...ammoPromotions]
      .filter((promotion) => !isAmmoPromotionExpired(promotion))
      .sort((a, b) => {
        const aIsLive = isAmmoPromotionActiveAt(a);
        const bIsLive = isAmmoPromotionActiveAt(b);

        if (aIsLive !== bIsLive) {
          return aIsLive ? -1 : 1;
        }

        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      });
  }, [ammoPromotions]);

  function resetForm() {
    setForm(getEmptyForm());
  }

  function resetPromotionForm() {
    setPromotionForm(getEmptyPromotionForm());
  }

  function startEditingPromotion(promotion: AmmoPromotion) {
    setPromotionForm({
      id: promotion.id,
      name: promotion.name,
      discountPercent: Number(promotion.discountPercent ?? 0),
      startsAt: toBusinessDateTimeLocalValue(promotion.startsAt),
      endsAt: toBusinessDateTimeLocalValue(promotion.endsAt),
      active: promotion.active,
    });
  }

  function updateLocalProduct(
    productId: string,
    key: keyof ProductRow,
    value: string | number | boolean | null
  ) {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId ? { ...product, [key]: value } : product
      )
    );
  }

  function toggleProductNameEdit(productId: string) {
    setEditingProductNameIds((prev) => {
      const next = new Set(prev);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
  }

  async function syncRenamedProductRecords(
    oldName: string,
    newName: string,
    category: string
  ) {
    const recipes = await getCraftRecipesFromSupabase();
    const oldRecipe = recipes.find((recipe) => recipe.itemName === oldName);

    await upsertCraftRecipeInSupabase(
      oldRecipe
        ? {
            ...oldRecipe,
            itemName: newName,
          }
        : {
            itemName: newName,
            yieldPerCraft: category === "Ammo" ? 5 : 1,
            titanium: 0,
            scrap: 0,
            steel: 0,
            plastic: 0,
            aluminum: 0,
            rubber: 0,
            electronics: 0,
            glass: 0,
            gunpowder: 0,
          }
    );

    if (oldRecipe) {
      await deleteCraftRecipeInSupabase(oldName);
    }

    const { error } = await supabase
      .from("commission_rates")
      .update({ product_name: newName })
      .eq("product_name", oldName);

    if (error) {
      throw error;
    }
  }

  async function saveAmmoPromotion() {
    const trimmedName = promotionForm.name.trim();

    if (!trimmedName) {
      showMessage("Please enter a promo name.");
      return;
    }

    if (promotionForm.discountPercent < 0 || promotionForm.discountPercent > 100) {
      showMessage("Promo discount must be between 0 and 100.");
      return;
    }

    if (!promotionForm.startsAt || !promotionForm.endsAt) {
      showMessage("Please choose both a start and end time.");
      return;
    }

    const startsAt = businessLocalDateTimeToIso(promotionForm.startsAt);
    const endsAt = businessLocalDateTimeToIso(promotionForm.endsAt);

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      showMessage("Promo end time must be after the start time.");
      return;
    }

    setSavingPromotion(true);

    try {
      await upsertAmmoPromotionInSupabase({
        id: promotionForm.id,
        name: trimmedName,
        discountPercent: Number(promotionForm.discountPercent),
        startsAt,
        endsAt,
        active: promotionForm.active,
      });

      await loadPromotions();
      await onPromotionsChanged?.();
      resetPromotionForm();
      showMessage(
        promotionForm.id ? "Ammo promo updated." : "Ammo promo saved."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save ammo promo.";
      showMessage(message);
    } finally {
      setSavingPromotion(false);
    }
  }

  async function toggleAmmoPromotion(promotion: AmmoPromotion) {
    setSavingPromotion(true);

    try {
      await setAmmoPromotionActiveInSupabase(promotion.id, !promotion.active);
      await loadPromotions();
      await onPromotionsChanged?.();
      if (promotionForm.id === promotion.id) {
        setPromotionForm((prev) => ({
          ...prev,
          active: !promotion.active,
        }));
      }
      showMessage(
        `${promotion.name} ${promotion.active ? "disabled" : "enabled"}.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update ammo promo.";
      showMessage(message);
    } finally {
      setSavingPromotion(false);
    }
  }

  async function deleteAmmoPromotion(promotion: AmmoPromotion) {
    if (promotion.active) {
      showMessage("Disable the promo before deleting it.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${promotion.name}"? This will permanently remove the promo.`
    );

    if (!confirmed) return;

    setSavingPromotion(true);

    try {
      await deleteAmmoPromotionInSupabase(promotion.id);
      await loadPromotions();
      await onPromotionsChanged?.();

      if (promotionForm.id === promotion.id) {
        resetPromotionForm();
      }

      showMessage(`${promotion.name} deleted.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete ammo promo.";
      showMessage(message);
    } finally {
      setSavingPromotion(false);
    }
  }

  async function addNewProduct() {
    const trimmedName = form.name.trim();

    if (!trimmedName) {
      showMessage("Please enter a product name.");
      return;
    }

    if (
      form.price < 0 ||
      form.cost < 0 ||
      form.vipPercent < 0 ||
      form.vipFixedPrice < 0
    ) {
      showMessage("Values cannot be negative.");
      return;
    }

    const payload = {
      name: trimmedName,
      category: form.category,
      price: Number(form.price),
      cost: Number(form.cost),
      vip_mode: form.vipMode,
      vip_percent: form.vipMode === "percent" ? Number(form.vipPercent) : null,
      vip_fixed_price:
        form.vipMode === "fixed" ? Number(form.vipFixedPrice) : null,
      active: true,
    };

    const { error } = await supabase.from("products").insert(payload);

    if (error) {
      showMessage(`Failed to add product: ${error.message}`);
      return;
    }

    await upsertCraftRecipeInSupabase({
      itemName: trimmedName,
      yieldPerCraft: form.category === "Ammo" ? 5 : 1,
      titanium: 0,
      scrap: 0,
      steel: 0,
      plastic: 0,
      aluminum: 0,
      rubber: 0,
      electronics: 0,
      glass: 0,
      gunpowder: 0,
    });

    await loadProducts();
    await onCatalogChanged?.();
    resetForm();
    showMessage("New product added.");
  }

  async function saveAllChanges() {
    setSavingAll(true);

    try {
      const trimmedProducts = products.map((product) => ({
        ...product,
        name: product.name.trim(),
      }));

      if (trimmedProducts.some((product) => !product.name)) {
        showMessage("Product names cannot be blank.");
        return;
      }

      const normalizedNames = trimmedProducts.map((product) =>
        product.name.toLowerCase()
      );
      const hasDuplicateName = normalizedNames.some(
        (name, index) => normalizedNames.indexOf(name) !== index
      );

      if (hasDuplicateName) {
        showMessage("Product names must be unique.");
        return;
      }

      for (const product of products) {
        const trimmedName = product.name.trim();
        const originalName = originalProductNames[product.id] ?? product.name;

        const { error } = await supabase
          .from("products")
          .update({
            name: trimmedName,
            category: product.category,
            price: Number(product.price),
            cost: Number(product.cost),
            vip_mode: product.vip_mode,
            vip_percent:
              product.vip_mode === "percent"
                ? Number(product.vip_percent ?? 0)
                : null,
            vip_fixed_price:
              product.vip_mode === "fixed"
                ? Number(product.vip_fixed_price ?? 0)
                : null,
          })
          .eq("id", product.id);

        if (error) {
          throw error;
        }

        if (trimmedName !== originalName) {
          await syncRenamedProductRecords(
            originalName,
            trimmedName,
            product.category
          );
        }
      }

      showMessage("Product catalog updated.");
      await loadProducts();
      await onCatalogChanged?.();
      setEditingProductNameIds(new Set());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown save error";
      showMessage(`Failed to save changes: ${message}`);
    } finally {
      setSavingAll(false);
    }
  }

  async function deleteProduct(productId: string, productName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${productName}" from the catalog?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", productId);

    if (error) {
      showMessage(`Failed to delete product: ${error.message}`);
      return;
    }

    await deleteCraftRecipeInSupabase(productName);
    await loadProducts();
    await onCatalogChanged?.();
    showMessage("Product deleted.");
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 space-y-3 xl:col-span-4">
        <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Catalog Entry
            </div>
            <div className="mt-1 text-sm font-semibold text-white">Add New Product</div>
            <div className="text-xs text-zinc-400">
              Create items with sale price, store cost, and VIP pricing.
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Product Name</label>
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="Enter product name"
                className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">Category</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              >
                {categories
                  .filter((category) => category !== "All")
                  .map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Sale Price</label>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      price: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-400">Store Cost</label>
                <input
                  type="number"
                  min="0"
                  value={form.cost}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      cost: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">VIP Mode</label>
              <select
                value={form.vipMode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    vipMode: e.target.value as VipMode,
                  }))
                }
                className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="none">none</option>
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
            </div>

            {form.vipMode === "percent" && (
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  VIP Percent
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.vipPercent}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      vipPercent: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            )}

            {form.vipMode === "fixed" && (
              <div>
                <label className="mb-1 block text-xs text-zinc-400">
                  VIP Fixed Price
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.vipFixedPrice}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      vipFixedPrice: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            )}

            <div className="rounded-[18px] border border-white/8 bg-black/20 p-3 text-xs text-zinc-400">
              <div>
                Normal Profit: {formatMoney(Math.max(form.price - form.cost, 0))}
              </div>
              <div className="mt-1">
                VIP Profit:{" "}
                {formatMoney(
                  Math.max(
                    (form.vipMode === "fixed"
                      ? form.vipFixedPrice
                      : form.vipMode === "percent"
                        ? Math.round(form.price * (1 - form.vipPercent / 100))
                        : form.price) - form.cost,
                    0
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={addNewProduct}
                className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.2)] hover:bg-red-500"
              >
                Add Product
              </button>

              <button
                onClick={resetForm}
                className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Clear Form
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Ammo Promotion
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              Schedule Ammo Sale
            </div>
            <div className="text-xs text-zinc-400">
              Promo pricing overrides bulk ammo and VIP pricing while the promo is
              active.
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Promo Name</label>
              <input
                value={promotionForm.name}
                onChange={(e) =>
                  setPromotionForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Discount Percent
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={promotionForm.discountPercent}
                onChange={(e) =>
                  setPromotionForm((prev) => ({
                    ...prev,
                    discountPercent: Number(e.target.value),
                  }))
                }
                className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Starts</label>
                <input
                  type="datetime-local"
                  value={promotionForm.startsAt}
                  onChange={(e) =>
                    setPromotionForm((prev) => ({
                      ...prev,
                      startsAt: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-400">Ends</label>
                <input
                  type="datetime-local"
                  value={promotionForm.endsAt}
                  onChange={(e) =>
                    setPromotionForm((prev) => ({
                      ...prev,
                      endsAt: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[18px] border border-white/8 bg-black/20 px-3 py-2.5">
              <div>
                <div className="text-xs font-medium text-white">Start Enabled</div>
                <div className="text-[11px] text-zinc-400">
                  Save this promo already enabled or keep it disabled for later.
                </div>
              </div>

              <button
                onClick={() =>
                  setPromotionForm((prev) => ({
                    ...prev,
                    active: !prev.active,
                  }))
                }
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  promotionForm.active
                    ? "bg-amber-400 text-black hover:bg-amber-300"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                }`}
              >
                {promotionForm.active ? "Enabled" : "Disabled"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={saveAmmoPromotion}
                disabled={savingPromotion}
                className="w-full rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-60"
              >
                {savingPromotion
                  ? "Saving..."
                  : promotionForm.id
                    ? "Update Promo"
                    : "Save Promo"}
              </button>

              <button
                onClick={resetPromotionForm}
                disabled={savingPromotion}
                className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                {promotionForm.id ? "Cancel Edit" : "Clear Form"}
              </button>
            </div>

            <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Live And Scheduled Ammo Promos
              </div>

              <div className="space-y-2">
                {orderedPromotions.map((promotion) => (
                  <div
                    key={promotion.id}
                    className="rounded-[16px] border border-white/8 bg-black/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {promotion.name}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-400">
                          {promotion.discountPercent}% off ammo
                        </div>
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-200">
                        {getAmmoPromotionStatusLabel(promotion)}
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-zinc-400">
                      {formatBusinessDateTime(promotion.startsAt)} to{" "}
                      {formatBusinessDateTime(promotion.endsAt)}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-amber-100/80">
                        {promotion.active
                          ? "Disable this promo before deleting it."
                          : "VIP and bulk ammo discounts are overridden during this window."}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteAmmoPromotion(promotion)}
                          disabled={savingPromotion || promotion.active}
                          className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Delete
                        </button>

                        <button
                          onClick={() => startEditingPromotion(promotion)}
                          disabled={savingPromotion}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => toggleAmmoPromotion(promotion)}
                          disabled={savingPromotion}
                          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                            promotion.active
                              ? "bg-zinc-800 text-white hover:bg-zinc-700"
                              : "bg-amber-400 text-black hover:bg-amber-300"
                          } disabled:opacity-60`}
                        >
                          {promotion.active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {orderedPromotions.length === 0 && (
                  <div className="rounded-[16px] border border-white/8 bg-black/20 p-3 text-sm text-zinc-400">
                    No live or scheduled ammo promos right now.
                  </div>
                )}
              </div>
            </div>

            {saveMessage && (
              <div className="rounded-[18px] border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                {saveMessage}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] xl:col-span-8">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Catalog Editor
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              Product Catalog
            </div>
            <div className="text-xs text-zinc-400">
              Edit names, sale prices, store costs, and VIP pricing.
            </div>
          </div>

          <div className="flex flex-col gap-2 xl:flex-row">
            <input
              placeholder="Search product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-w-[200px] rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-w-[160px] rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <button
              onClick={saveAllChanges}
              disabled={savingAll}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.2)] hover:bg-red-500 disabled:opacity-60"
            >
              {savingAll ? "Saving..." : "Save All Changes"}
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-[18px] border border-white/8 bg-black/20 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Products Shown</span>
            <span className="font-semibold text-white">{filteredProducts.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
            Loading products...
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => {
              const catalogProduct = toCatalogProduct(product);

              return (
                <div
                  key={product.id}
                  className="rounded-[22px] border border-white/8 bg-black/20 p-4"
                >
                  <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      {editingProductNameIds.has(product.id) ? (
                        <input
                          value={product.name}
                          onChange={(e) =>
                            updateLocalProduct(product.id, "name", e.target.value)
                          }
                          className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-lg font-semibold text-white outline-none xl:min-w-[280px]"
                        />
                      ) : (
                        <div className="text-lg font-semibold text-white">
                          {product.name}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-zinc-400">
                        Normal Profit: {formatMoney(getNormalUnitProfit(catalogProduct))} | VIP Profit:{" "}
                        {formatMoney(getVipUnitProfit(catalogProduct))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleProductNameEdit(product.id)}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                      >
                        {editingProductNameIds.has(product.id)
                          ? "Done Editing"
                          : "Edit Name"}
                      </button>

                      <button
                        onClick={() => deleteProduct(product.id, product.name)}
                        className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                      >
                        Delete Product
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">Category</label>
                      <select
                        value={product.category}
                        onChange={(e) =>
                          updateLocalProduct(product.id, "category", e.target.value)
                        }
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        {categories
                          .filter((category) => category !== "All")
                          .map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">Sale Price</label>
                      <input
                        type="number"
                        min="0"
                        value={Number(product.price ?? 0)}
                        onChange={(e) =>
                          updateLocalProduct(product.id, "price", Number(e.target.value))
                        }
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">Store Cost</label>
                      <input
                        type="number"
                        min="0"
                        value={Number(product.cost ?? 0)}
                        onChange={(e) =>
                          updateLocalProduct(product.id, "cost", Number(e.target.value))
                        }
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">VIP Mode</label>
                      <select
                        value={product.vip_mode ?? "none"}
                        onChange={(e) =>
                          updateLocalProduct(product.id, "vip_mode", e.target.value as VipMode)
                        }
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      >
                        <option value="none">none</option>
                        <option value="percent">percent</option>
                        <option value="fixed">fixed</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">
                        VIP Percent
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={Number(product.vip_percent ?? 0)}
                        onChange={(e) =>
                          updateLocalProduct(product.id, "vip_percent", Number(e.target.value))
                        }
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-400">
                        VIP Fixed Price
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={Number(product.vip_fixed_price ?? 0)}
                        onChange={(e) =>
                          updateLocalProduct(
                            product.id,
                            "vip_fixed_price",
                            Number(e.target.value)
                          )
                        }
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
                No products found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
