"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";

import { ammoBulkItems, categories } from "@/lib/gunstore/catalog";
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
        .map((i) => (i.name === name ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
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
          productId: (item as any).id ?? null,
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
      <div className="px-6 py-3">
        <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1480px] flex-col gap-2.5">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              {employee.image ? (
                <img
                  src={employee.image}
                  alt={employee.name}
                  className="h-9 w-9 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 font-semibold text-white">
                  {employee.name.charAt(0)}
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-white">
                  {employee.name}
                </div>
                <div className="text-[11px] text-zinc-400">{employee.role}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="hidden text-[11px] text-zinc-400 md:block">
                Gunstore 60 System
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Logout
              </button>
            </div>
          </div>

          {successMessage && (
            <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-300 backdrop-blur-xl">
              {successMessage}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-12 gap-2.5">
            <aside className="col-span-12 flex h-full flex-col rounded-xl border border-white/10 bg-black/20 p-2.5 backdrop-blur-xl xl:col-span-2">
              <div className="mb-2.5 rounded-lg border border-white/10 bg-black/20 p-2.5">
                <h1 className="text-base font-bold">Dashboard</h1>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Employee sales panel
                </p>
              </div>

              <div className="flex-1 space-y-1.5 overflow-y-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      selectedCategory === cat
                        ? "bg-red-600 text-white"
                        : "bg-black/20 text-zinc-200 hover:bg-white/10"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </aside>

            <section className="col-span-12 flex h-full min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-2.5 backdrop-blur-xl xl:col-span-7">
              <div className="mb-2.5 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs">
                    <span className="text-zinc-300">Category:</span>{" "}
                    <span className="font-semibold text-white">{selectedCategory}</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs">
                    <span className="text-zinc-300">Items:</span>{" "}
                    <span className="font-semibold text-white">{itemCount}</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs">
                    <span className="text-zinc-300">Total:</span>{" "}
                    <span className="font-semibold text-white">${total}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full min-w-[180px] rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white placeholder:text-zinc-400 outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {loadingProducts ? (
                  <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                    Loading products...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 2xl:grid-cols-2">
                    {filtered.map((p) => {
                      const price = getCatalogPrice(p, 1, vipEnabled);
                      const showBulk =
                        !vipEnabled &&
                        p.category === "Ammo" &&
                        ammoBulkItems.includes(p.name);

                      return (
                        <button
                          key={p.name}
                          onClick={() => addToCart(p)}
                          className="rounded-xl border border-white/10 bg-black/25 p-3 text-left backdrop-blur-xl transition hover:border-red-400/40 hover:bg-red-500/10"
                        >
                          <div className="flex min-h-[96px] flex-col justify-between">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                                {p.category}
                              </div>

                              <div className="mt-1 text-lg font-semibold text-white">
                                {p.name}
                              </div>
                            </div>

                            <div>
                              <div className="mt-2 text-2xl font-medium leading-none text-red-400">
                                ${p.price}
                              </div>

                              {vipEnabled && price !== p.price && (
                                <div className="mt-1.5 text-[11px] text-green-300">
                                  VIP: ${price}
                                </div>
                              )}

                              {showBulk && (
                                <div className="mt-1.5 text-[10px] text-zinc-400">
                                  10+ units: ${p.price - 50} each
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <aside className="col-span-12 flex h-full min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-2.5 backdrop-blur-xl xl:col-span-3">
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Cart</h2>
                  <p className="text-[11px] text-zinc-400">Current order</p>
                </div>

                <button
                  onClick={clearCart}
                  className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/10"
                >
                  Clear
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-2">
                  {pricedCart.length === 0 && (
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
                      No items added yet.
                    </div>
                  )}

                  {pricedCart.map((item) => {
                    const showBulkApplied =
                      !vipEnabled &&
                      item.category === "Ammo" &&
                      ammoBulkItems.includes(item.name) &&
                      item.qty >= 10;

                    return (
                      <div
                        key={item.name}
                        className="rounded-lg border border-white/10 bg-black/25 p-2.5"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              ${item.effectivePrice} each
                            </div>
                            {showBulkApplied && (
                              <div className="text-[10px] text-green-300">
                                Bulk pricing applied
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => removeItem(item.name)}
                            className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => changeQty(item.name, -1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-xs text-white hover:bg-white/10"
                            >
                              -
                            </button>
                            <span className="min-w-5 text-center text-xs font-medium">
                              {item.qty}
                            </span>
                            <button
                              onClick={() => changeQty(item.name, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-xs text-white hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-xs font-semibold text-white">
                            ${item.lineTotal}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2.5 rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-2.5 py-2.5">
                  <div>
                    <div className="text-[10px] text-zinc-400">VIP Pricing</div>
                    <div className="text-xs font-semibold text-white">
                      {vipEnabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>

                  <button
                    onClick={() => setVipEnabled(!vipEnabled)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      vipEnabled
                        ? "bg-yellow-500 text-black hover:bg-yellow-400"
                        : "bg-zinc-800 text-white hover:bg-zinc-700"
                    }`}
                  >
                    {vipEnabled ? "VIP ON" : "VIP OFF"}
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Subtotal</span>
                    <span className="font-medium text-white">${subtotal}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-green-300">Discount</span>
                    <span className="font-medium text-green-300">-${discount}</span>
                  </div>

                  <div className="flex justify-between border-t border-white/10 pt-2.5 text-sm font-bold">
                    <span>Total</span>
                    <span>${total}</span>
                  </div>
                </div>

                <button
                  onClick={finalizeOrder}
                  disabled={submittingOrder}
                  className="mt-3 w-full rounded-lg bg-white/90 px-4 py-2.5 text-xs font-semibold text-black hover:bg-white disabled:opacity-60"
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