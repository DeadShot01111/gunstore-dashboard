"use client";

import { useEffect, useMemo, useState } from "react";
import { categories } from "@/lib/gunstore/catalog";
import { CatalogProduct, VipMode } from "@/lib/gunstore/types";
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

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
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

export default function ProductManagementTab() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [saveMessage, setSaveMessage] = useState("");
  const [form, setForm] = useState<ProductFormState>(getEmptyForm());
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);

  async function loadProducts() {
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

    setProducts((data ?? []) as ProductRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadProducts();
  }, []);

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

  function showMessage(message: string) {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 2500);
  }

  function resetForm() {
    setForm(getEmptyForm());
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

    await loadProducts();
    resetForm();
    showMessage("New product added.");
  }

  async function saveAllChanges() {
    setSavingAll(true);

    try {
      for (const product of products) {
        const { error } = await supabase
          .from("products")
          .update({
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
      }

      showMessage("Product catalog updated.");
      await loadProducts();
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

    await loadProducts();
    showMessage("Product deleted.");
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] xl:col-span-4">
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
              <label className="mb-1 block text-xs text-zinc-400">VIP Percent</label>
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
            <div>Normal Profit: {formatMoney(Math.max(form.price - form.cost, 0))}</div>
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

          {saveMessage && (
            <div className="rounded-[18px] border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
              {saveMessage}
            </div>
          )}
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
              Edit sale prices, store costs, and VIP pricing only.
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
                      <div className="text-lg font-semibold text-white">
                        {product.name}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        Normal Profit: {formatMoney(getNormalUnitProfit(catalogProduct))} | VIP Profit:{" "}
                        {formatMoney(getVipUnitProfit(catalogProduct))}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteProduct(product.id, product.name)}
                      className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                    >
                      Delete Product
                    </button>
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
