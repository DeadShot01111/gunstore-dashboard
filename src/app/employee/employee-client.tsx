"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";

import { categories } from "@/lib/gunstore/catalog";
import {
  CommissionRateRecord,
  getCommissionPercentForProduct,
  getCommissionRatesFromSupabase,
} from "@/lib/gunstore/commissions";
import { createOrderInSupabase } from "@/lib/gunstore/orders";
import { getCatalogPrice } from "@/lib/gunstore/pricing";
import { supabase } from "@/lib/supabase/client";
import { CartItem, CatalogProduct } from "@/lib/gunstore/types";

type EmployeeClientProps = {
  user: {
    name?: string | null;
    image?: string | null;
    email?: string | null;
    nickname?: string | null;
    avatar?: string | null;
    role?: string | null;
    discordId?: string | null;
  };
  role?: string;
};

type ProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  vip_mode: "none" | "percent" | "fixed";
  vip_percent: number | null;
  vip_fixed_price: number | null;
  active: boolean;
};

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
  } as CatalogProduct;
}

function getProductCost(product: CatalogProduct) {
  return Number(product.cost ?? 0);
}

function isBulkDiscountAmmo(product: Pick<CatalogProduct, "category">) {
  return product.category === "Ammo";
}

function getBulkDiscountLabel(product: CatalogProduct) {
  if (!isBulkDiscountAmmo(product)) return null;
  if (product.name === "Hunting Ammo") return null;
  return "20+ units: $50 off each";
}

function clampQty(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export default function EmployeeClient({
  user,
  role = "employee",
}: EmployeeClientProps) {
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [commissionRates, setCommissionRates] = useState<CommissionRateRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [vipEnabled, setVipEnabled] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  useEffect(() => {
    void loadEmployeeData();
  }, []);

  async function loadEmployeeData() {
    setLoadingProducts(true);

    try {
      const [productsResult, loadedRates] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        getCommissionRatesFromSupabase(),
      ]);

      if (!productsResult.error && Array.isArray(productsResult.data)) {
        setCatalogProducts((productsResult.data as ProductRow[]).map(toCatalogProduct));
      } else if (productsResult.error) {
        setSuccessMessage(`Failed to load products: ${productsResult.error.message}`);
        setTimeout(() => setSuccessMessage(""), 2500);
      }

      setCommissionRates(loadedRates);
    } catch (error) {
      console.error(error);
      setSuccessMessage("Failed to load employee data.");
      setTimeout(() => setSuccessMessage(""), 2500);
    } finally {
      setLoadingProducts(false);
    }
  }

  const employee = {
    name: user.nickname ?? user.name ?? "Unknown User",
    role: role === "management" ? "Management" : "Employee",
    image: user.avatar ?? user.image ?? null,
    email: user.email ?? "",
    discordId: user.discordId ?? null,
  };

  function addToCart(product: CatalogProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.name === product.name);

      if (existing) {
        return prev.map((i) =>
          i.name === product.name ? { ...i, qty: i.qty + 1 } : i
        );
      }

      return [...prev, { ...product, qty: 1 }];
    });
  }

  function changeQty(name: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.name === name
            ? {
                ...i,
                qty: clampQty(
                  i.qty === 1 && delta > 1 ? delta : i.qty + delta
                ),
              }
            : i
        )
        .filter((i) => i.qty > 0)
    );
  }

  function setQty(name: string, nextQty: number) {
    setCart((prev) =>
      prev.map((i) =>
        i.name === name ? { ...i, qty: clampQty(nextQty) } : i
      )
    );
  }

  function removeItem(name: string) {
    setCart((prev) => prev.filter((i) => i.name !== name));
  }

  function clearCart() {
    setCart([]);
  }

  async function finalizeOrder() {
    if (cart.length === 0) {
      setSuccessMessage("Cart is empty.");
      setTimeout(() => setSuccessMessage(""), 2200);
      return;
    }

    setSubmittingOrder(true);

    try {
      const rawSubtotal = cart.reduce(
        (sum, item) => sum + Number(item.price ?? 0) * item.qty,
        0
      );

      const orderItems = cart.map((item) => {
        const unitPrice = getCatalogPrice(item, item.qty, vipEnabled);
        const unitCost = getProductCost(item);
        const commissionPercent = getCommissionPercentForProduct(
          item.name,
          commissionRates
        );

        const unitProfit = Math.max(unitPrice - unitCost, 0);
        const totalProfit = unitProfit * item.qty;
        const commissionEarned = Math.round(totalProfit * (commissionPercent / 100));

        return {
          productId: item.id ?? null,
          name: item.name,
          category: item.category,
          qty: item.qty,
          unitPrice,
          lineTotal: unitPrice * item.qty,
          unitCost,
          unitProfit,
          totalProfit,
          commissionPercent,
          commissionEarned,
        };
      });

      const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const discount = rawSubtotal - subtotal;
      const total = subtotal;
      const totalProfit = orderItems.reduce(
        (sum, item) => sum + Number(item.totalProfit ?? 0),
        0
      );

      await createOrderInSupabase({
        employeeDiscordId: employee.discordId,
        employeeName: employee.name,
        employeeEmail: employee.email,
        role: employee.role,
        vipEnabled,
        subtotal,
        discount,
        total,
        totalProfit,
        status: "Completed",
        notes: "",
        items: orderItems,
      });

      setCart([]);
      setVipEnabled(false);
      setSuccessMessage("Order saved to database.");
      setTimeout(() => setSuccessMessage(""), 2200);
    } catch (error) {
      console.error(error);
      setSuccessMessage("Failed to save order.");
      setTimeout(() => setSuccessMessage(""), 2200);
    } finally {
      setSubmittingOrder(false);
    }
  }

  const filtered = useMemo(() => {
    return catalogProducts.filter((p) => {
      const matchesCategory =
        selectedCategory === "All" || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [catalogProducts, selectedCategory, search]);

  const itemCount = useMemo(
    () => cart.reduce((sum, i) => sum + i.qty, 0),
    [cart]
  );

  const rawSubtotal = useMemo(
    () => cart.reduce((sum, i) => sum + Number(i.price ?? 0) * i.qty, 0),
    [cart]
  );

  const pricedCart = useMemo(() => {
    return cart.map((item) => {
      const unitPrice = getCatalogPrice(item, item.qty, vipEnabled);

      return {
        ...item,
        effectivePrice: unitPrice,
        lineTotal: unitPrice * item.qty,
      };
    });
  }, [cart, vipEnabled]);

  const subtotal = useMemo(
    () => pricedCart.reduce((sum, item) => sum + item.lineTotal, 0),
    [pricedCart]
  );

  const discount = rawSubtotal - subtotal;
  const total = subtotal;

  return (
    <main className="min-h-screen text-white">
      <div className="px-5 py-4 md:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-32px)] max-w-[1500px] flex-col gap-3">
          <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
            <div className="flex items-center gap-2.5">
              {employee.image ? (
                <img
                  src={employee.image}
                  alt={employee.name}
                  className="h-10 w-10 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/90 font-semibold text-white shadow-[0_10px_20px_rgba(220,38,38,0.28)]">
                  {employee.name.charAt(0)}
                </div>
              )}

              <div>
                <div className="text-sm font-semibold tracking-tight text-white">
                  {employee.name}
                </div>
                <div className="text-[11px] text-zinc-400">{employee.role}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-zinc-300 md:block">
                Ammunation 60 Employee
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.22)] transition hover:bg-red-500"
              >
                Logout
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="rounded-[20px] border border-green-400/20 bg-green-500/10 px-4 py-2.5 text-xs text-green-300 backdrop-blur-xl">
              {successMessage}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
            <aside className="col-span-12 flex h-full flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl xl:col-span-2">
              <div className="mb-3 rounded-[20px] border border-white/8 bg-black/20 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200">
                  Employee
                </div>
                <h1 className="mt-2 text-lg font-bold tracking-tight text-white">
                  Sales Workspace
                </h1>
                <p className="mt-1 text-[11px] leading-5 text-zinc-400">
                  Browse inventory, build orders, and process live sales with a cleaner control flow.
                </p>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full rounded-[18px] border px-3.5 py-3 text-left text-sm font-medium transition ${
                      selectedCategory === cat
                        ? "border-red-400/20 bg-red-500/[0.08] text-white shadow-[inset_3px_0_0_0_rgba(248,113,113,0.9)]"
                        : "border-transparent bg-black/20 text-zinc-200 hover:border-white/8 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{cat}</span>
                      {selectedCategory === cat && (
                        <span className="h-2 w-2 rounded-full bg-red-300 shadow-[0_0_14px_rgba(252,165,165,0.7)]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="col-span-12 flex h-full min-h-0 flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl xl:col-span-7">
              <div className="mb-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Active View
                </div>
                <div className="mt-1 text-base font-semibold tracking-tight text-white">
                  {selectedCategory === "All" ? "Product Catalog" : selectedCategory}
                </div>
                <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs">
                      <span className="text-zinc-300">Category:</span>{" "}
                      <span className="font-semibold text-white">{selectedCategory}</span>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs">
                      <span className="text-zinc-300">Items:</span>{" "}
                      <span className="font-semibold text-white">{itemCount}</span>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs">
                      <span className="text-zinc-300">Total:</span>{" "}
                      <span className="font-semibold text-white">${total}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      placeholder="Search products..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full min-w-[210px] rounded-xl border border-white/10 bg-black/25 px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-400 outline-none transition focus:border-red-400/40"
                    />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1.5">
                {loadingProducts ? (
                  <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
                    Loading products...
                  </div>
                ) : filtered.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
                    {filtered.map((p) => {
                      const price = getCatalogPrice(p, 1, vipEnabled);
                      const bulkLabel = !vipEnabled ? getBulkDiscountLabel(p) : null;

                      return (
                        <button
                          key={p.name}
                          onClick={() => addToCart(p)}
                          className="group relative overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 text-left shadow-[0_10px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-red-300/25 hover:bg-[linear-gradient(180deg,rgba(127,29,29,0.2),rgba(255,255,255,0.03))]"
                        >
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-70" />

                          <div className="flex min-h-[148px] flex-col justify-between">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                                  {p.category}
                                </div>

                                <div className="mt-3 text-xl font-semibold leading-tight text-white">
                                  {p.name}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-red-400/15 bg-red-500/10 px-3 py-2 text-right">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200/80">
                                  Price
                                </div>
                                <div className="mt-1 text-xl font-semibold leading-none text-red-300">
                                  ${price}
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 space-y-2">
                              {vipEnabled && price !== p.price && (
                                <div className="text-[11px] font-medium text-green-300">
                                  VIP pricing active: ${price}
                                </div>
                              )}

                              {bulkLabel && (
                                <div className="text-[11px] text-zinc-400">
                                  {bulkLabel}
                                </div>
                              )}

                              <div className="flex items-center justify-between border-t border-white/8 pt-3">
                                <div className="text-[11px] text-zinc-500">
                                  Select to add to order
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-200 transition group-hover:border-red-300/20 group-hover:text-white">
                                  Add Item
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-white/8 bg-black/20 p-5 text-sm text-zinc-400">
                    No products matched this category and search.
                  </div>
                )}
              </div>
            </section>

            <aside className="col-span-12 flex h-full min-h-0 flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl xl:col-span-3">
              <div className="mb-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Order Builder
                    </div>
                    <h2 className="mt-1 text-base font-semibold tracking-tight text-white">
                      Current Cart
                    </h2>
                    <p className="text-[11px] text-zinc-400">
                      Review quantities and finalize the active sale.
                    </p>
                  </div>

                  <button
                    onClick={clearCart}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                    {pricedCart.length} line {pricedCart.length === 1 ? "item" : "items"}
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                    {itemCount} total units
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1.5">
                <div className="space-y-2">
                  {pricedCart.length === 0 && (
                    <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
                      No items added yet. Select products from the catalog to start building an order.
                    </div>
                  )}

                  {pricedCart.map((item) => {
                    const showBulkApplied =
                      !vipEnabled &&
                      isBulkDiscountAmmo(item) &&
                      item.qty >= 20;

                    return (
                      <div
                        key={item.name}
                        className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3.5 shadow-[0_12px_26px_rgba(0,0,0,0.14)]"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {item.name}
                            </div>
                            <div className="mt-0.5 text-[11px] text-zinc-400">
                              ${item.effectivePrice} each
                            </div>
                            {showBulkApplied && (
                              <div className="mt-1 text-[10px] font-medium text-green-300">
                                Bulk pricing applied
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => removeItem(item.name)}
                            className="rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-medium text-red-300 transition hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => changeQty(item.name, -1)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-xs text-white transition hover:bg-white/10"
                              >
                                -1
                              </button>
                              <button
                                onClick={() => changeQty(item.name, 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-xs text-white transition hover:bg-white/10"
                              >
                                +1
                              </button>
                            </div>

                            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white">
                              ${item.lineTotal}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() => changeQty(item.name, -5)}
                              className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] text-white transition hover:bg-white/10"
                            >
                              -5
                            </button>
                            <button
                              onClick={() => changeQty(item.name, -10)}
                              className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] text-white transition hover:bg-white/10"
                            >
                              -10
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) =>
                                setQty(item.name, Number(e.target.value))
                              }
                              className="w-16 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-center text-xs text-white outline-none"
                            />

                            <button
                              onClick={() => changeQty(item.name, 5)}
                              className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] text-white transition hover:bg-white/10"
                            >
                              +5
                            </button>
                            <button
                              onClick={() => changeQty(item.name, 10)}
                              className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] text-white transition hover:bg-white/10"
                            >
                              +10
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 rounded-[20px] border border-white/8 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between rounded-[18px] border border-white/8 bg-black/20 px-3 py-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      VIP Pricing
                    </div>
                    <div className="mt-1 text-xs font-semibold text-white">
                      {vipEnabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>

                  <button
                    onClick={() => setVipEnabled(!vipEnabled)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      vipEnabled
                        ? "bg-yellow-500 text-black hover:bg-yellow-400"
                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                    }`}
                  >
                    {vipEnabled ? "VIP ON" : "VIP OFF"}
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Subtotal</span>
                    <span className="font-medium text-white">${subtotal}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-green-300">Discount</span>
                    <span className="font-medium text-green-300">-${discount}</span>
                  </div>

                  <div className="flex justify-between border-t border-white/10 pt-3 text-sm font-bold">
                    <span>Total</span>
                    <span>${total}</span>
                  </div>
                </div>

                <button
                  onClick={finalizeOrder}
                  disabled={submittingOrder}
                  className="mt-4 w-full rounded-xl bg-white/90 px-4 py-3 text-xs font-semibold text-black transition hover:bg-white disabled:opacity-60"
                >
                  {submittingOrder ? "Saving..." : "Finalize Order"}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
