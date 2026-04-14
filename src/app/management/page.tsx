"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";

import BusinessPerformanceTab from "@/app/management/components/business-performance-tab";
import CommissionsTab from "@/app/management/components/commissions-tab";
import MaterialPurchaseTab from "@/app/management/components/material-purchase-tab";
import OverviewTab from "@/app/management/components/overview-tab";
import ProductManagementTab from "@/app/management/components/product-management-tab";

import {
  deleteOrderInSupabase,
  getOrdersFromSupabase,
  updateOrderInSupabase,
} from "@/lib/gunstore/orders";
import { recalcOrder } from "@/lib/gunstore/pricing";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";
import { supabase } from "@/lib/supabase/client";
import {
  CatalogProduct,
  SavedOrder,
  SavedOrderItem,
} from "@/lib/gunstore/types";

type ManagerTab =
  | "overview"
  | "sales_logs"
  | "material_purchase"
  | "product_management"
  | "commissions"
  | "business_performance";

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

type SessionUserExtras = {
  nickname?: string | null;
  avatar?: string | null;
  role?: string | null;
};

const tabs: { key: ManagerTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "sales_logs", label: "Sales Logs" },
  { key: "material_purchase", label: "Material Purchase" },
  { key: "product_management", label: "Product Management" },
  { key: "commissions", label: "Commissions" },
  { key: "business_performance", label: "Business Performance" },
];

function formatMoney(value: number) {
  return `$${Number(value ?? 0).toLocaleString()}`;
}

function formatDisplayDate(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDateTime(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function cloneOrder(order: SavedOrder): SavedOrder {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
  };
}

function getDiscountMode(order: SavedOrder) {
  return Number(order.total ?? 0) < Number(order.subtotal ?? 0)
    ? "applied"
    : "informational";
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
  } as CatalogProduct;
}

export default function ManagementPage() {
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState<ManagerTab>("overview");
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<SavedOrder | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    void loadPageData();
  }, []);

  async function loadPageData() {
    setLoadingOrders(true);

    try {
      const [loadedOrders, productsResult] = await Promise.all([
        getOrdersFromSupabase(),
        supabase
          .from("products")
          .select("*")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
      ]);

      setOrders(loadedOrders);

      if (!productsResult.error && Array.isArray(productsResult.data)) {
        setCatalogProducts(
          (productsResult.data as ProductRow[]).map(toCatalogProduct)
        );
      } else {
        setSaveMessage(
          `Failed to load products: ${productsResult.error?.message ?? "Unknown error"}`
        );
        setTimeout(() => setSaveMessage(""), 2500);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load sales logs.";
      setSaveMessage(message);
      setTimeout(() => setSaveMessage(""), 2500);
    } finally {
      setLoadingOrders(false);
    }
  }

  const selectedOrder = useMemo(() => {
    return orders.find((order) => order.id === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  useEffect(() => {
    if (selectedOrder) {
      setDraftOrder(cloneOrder(selectedOrder));
    } else {
      setDraftOrder(null);
    }
  }, [selectedOrder]);

  const weekOrders = useMemo(() => {
    return orders
      .filter((order) => isWithinWeek(order.createdAt, weekAnchor))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [orders, weekAnchor]);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);

  function shiftWeek(direction: "prev" | "next") {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (direction === "prev" ? -7 : 7));
      return next;
    });
  }

  function updateDraftField<K extends keyof SavedOrder>(
    key: K,
    value: SavedOrder[K]
  ) {
    if (!draftOrder) return;

    const updated = {
      ...draftOrder,
      [key]: value,
    };

    setDraftOrder(
      recalcOrder(updated, catalogProducts, {
        discountMode: key === "discount" ? "applied" : getDiscountMode(draftOrder),
      })
    );
  }

  function updateDraftItem(
    index: number,
    field: keyof SavedOrderItem,
    value: string | number
  ) {
    if (!draftOrder) return;

    const items = draftOrder.items.map((item, i) => {
      if (i !== index) return item;

      if (field === "name") {
        return {
          ...item,
          name: String(value),
        };
      }

      return {
        ...item,
        [field]:
          field === "qty" || field === "unitPrice"
            ? Number(value)
            : value,
      };
    });

    setDraftOrder(
      recalcOrder(
        {
          ...draftOrder,
          items,
        },
        catalogProducts,
        {
          discountMode: getDiscountMode(draftOrder),
        }
      )
    );
  }

  function addDraftItem() {
    if (!draftOrder) return;

    const items: SavedOrderItem[] = [
      ...draftOrder.items,
      {
        name: "",
        category: "",
        qty: 1,
        unitPrice: 0,
        lineTotal: 0,
      },
    ];

    setDraftOrder(
      recalcOrder(
        {
          ...draftOrder,
          items,
        },
        catalogProducts,
        {
          discountMode: getDiscountMode(draftOrder),
        }
      )
    );
  }

  function removeDraftItem(index: number) {
    if (!draftOrder) return;

    const items = draftOrder.items.filter((_, i) => i !== index);

    setDraftOrder(
      recalcOrder(
        {
          ...draftOrder,
          items,
        },
        catalogProducts,
        {
          discountMode: getDiscountMode(draftOrder),
        }
      )
    );
  }

  async function saveDraftOrder() {
    if (!draftOrder) return;

    setSavingOrder(true);

    try {
      const finalOrder = recalcOrder(
        {
          ...draftOrder,
          createdAt: new Date(draftOrder.createdAt).toISOString(),
          status: draftOrder.status ?? "Edited",
        },
        catalogProducts,
        {
          discountMode: getDiscountMode(draftOrder),
        }
      );

      await updateOrderInSupabase(finalOrder);

      const refreshedOrders = await getOrdersFromSupabase();
      setOrders(refreshedOrders);
      setSelectedOrderId(finalOrder.id);

      setSaveMessage("Sales log updated.");
      setTimeout(() => setSaveMessage(""), 2200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update sale log.";
      setSaveMessage(message);
      setTimeout(() => setSaveMessage(""), 2500);
    } finally {
      setSavingOrder(false);
    }
  }

  async function deleteSelectedOrder() {
    if (!selectedOrderId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this sale log?"
    );

    if (!confirmed) return;

    setSavingOrder(true);

    try {
      await deleteOrderInSupabase(selectedOrderId);

      const refreshedOrders = await getOrdersFromSupabase();
      setOrders(refreshedOrders);
      setSelectedOrderId(null);
      setDraftOrder(null);

      setSaveMessage("Sales log deleted.");
      setTimeout(() => setSaveMessage(""), 2200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete sale log.";
      setSaveMessage(message);
      setTimeout(() => setSaveMessage(""), 2500);
    } finally {
      setSavingOrder(false);
    }
  }

  const displayName =
    (session?.user as SessionUserExtras | undefined)?.nickname ||
    session?.user?.name ||
    "Manager";

  const avatar =
    (session?.user as SessionUserExtras | undefined)?.avatar ||
    session?.user?.image ||
    null;

  const rankLabel =
    (session?.user as SessionUserExtras | undefined)?.role === "management"
      ? "Management"
      : (session?.user as SessionUserExtras | undefined)?.role === "employee"
      ? "Employee"
      : "Unauthorized";

  function renderSalesLogs() {
    return (
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] xl:col-span-7">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Weekly Activity
              </div>
              <div className="mt-1 text-sm font-semibold text-white">Weekly Sales Logs</div>
              <div className="text-xs text-zinc-400">
                Monday 12:00 AM to Sunday 11:59 PM
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftWeek("prev")}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
              >
                Previous Week
              </button>

              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-300">
                {formatDisplayDate(weekRange.start)} - {formatDisplayDate(weekRange.end)}
              </div>

              <button
                onClick={() => shiftWeek("next")}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
              >
                Next Week
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-[18px] border border-amber-300/15 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Do not delete any sales from the sales log table unless absolutely necessary. Use edits and notes to correct records when possible.
          </div>

          {loadingOrders ? (
            <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
              Loading sales logs...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr className="border-b border-white/10">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Employee</th>
                    <th className="pb-2 font-medium">VIP</th>
                    <th className="pb-2 font-medium">Subtotal</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {weekOrders.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedOrderId(row.id)}
                      className={`cursor-pointer border-b border-white/5 transition hover:bg-white/5 ${
                        selectedOrderId === row.id ? "bg-white/[0.05]" : ""
                      }`}
                    >
                      <td className="py-3 text-white">{formatDisplayDateTime(row.createdAt)}</td>
                      <td className="py-3 text-white">{row.employeeName}</td>
                      <td className="py-3 text-zinc-300">{row.vipEnabled ? "Yes" : "No"}</td>
                      <td className="py-3 text-white">{formatMoney(row.subtotal)}</td>
                      <td className="py-3 text-white">{formatMoney(row.total)}</td>
                      <td className="py-3 text-zinc-300">{row.status ?? "Completed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {weekOrders.length === 0 && (
                <div className="py-8 text-center text-sm text-zinc-400">
                  No sales found for this week.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Record Editor
              </div>
              <div className="mt-1 text-sm font-semibold text-white">Sales Log Details</div>
              <div className="text-xs text-zinc-400">
                Select a log row to review and edit.
              </div>
            </div>

            {saveMessage && (
              <div className="text-xs text-green-300">{saveMessage}</div>
            )}
          </div>

          {!draftOrder ? (
            <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
              No log selected yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Date / Time</label>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(draftOrder.createdAt)}
                    onChange={(e) =>
                      updateDraftField(
                        "createdAt",
                        new Date(e.target.value).toISOString()
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Employee</label>
                  <input
                    value={draftOrder.employeeName}
                    onChange={(e) => updateDraftField("employeeName", e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">VIP</label>
                  <select
                    value={draftOrder.vipEnabled ? "yes" : "no"}
                    onChange={(e) =>
                      updateDraftField("vipEnabled", e.target.value === "yes")
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Status</label>
                  <select
                    value={draftOrder.status ?? "Completed"}
                    onChange={(e) =>
                      updateDraftField(
                        "status",
                        e.target.value as "Completed" | "Edited" | "Pending Review"
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="Completed">Completed</option>
                    <option value="Edited">Edited</option>
                    <option value="Pending Review">Pending Review</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">Items Sold</div>
                  <button
                    onClick={addDraftItem}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                  >
                    Add Item
                  </button>
                </div>

                <div className="space-y-2">
                  {draftOrder.items.map((item, index) => (
                    <div
                      key={`${draftOrder.id}-${index}`}
                      className="rounded-lg border border-white/10 bg-black/20 p-3"
                    >
                      <div className="grid grid-cols-1 gap-2 xl:grid-cols-4">
                        <select
                          value={item.name}
                          onChange={(e) => updateDraftItem(index, "name", e.target.value)}
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                        >
                          <option value="">Select item</option>
                          {catalogProducts.map((product) => (
                            <option key={product.name} value={product.name}>
                              {product.name}
                            </option>
                          ))}
                        </select>

                        <input
                          value={item.category}
                          readOnly
                          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300 outline-none"
                        />

                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) =>
                            updateDraftItem(index, "qty", Number(e.target.value))
                          }
                          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                        />

                        <input
                          type="number"
                          min="0"
                          placeholder="Unit price"
                          value={item.unitPrice}
                          readOnly
                          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300 outline-none"
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-xs text-zinc-400">
                          Line Total: {formatMoney(item.qty * item.unitPrice)}
                        </div>

                        <button
                          onClick={() => removeDraftItem(index)}
                          className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20"
                        >
                          Remove Item
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-400">Notes</label>
                <textarea
                  value={draftOrder.notes ?? ""}
                  onChange={(e) => updateDraftField("notes", e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Subtotal</span>
                    <span className="text-white">{formatMoney(draftOrder.subtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Discount</span>
                    <input
                      type="number"
                      min="0"
                      value={draftOrder.discount}
                      onChange={(e) =>
                        updateDraftField("discount", Number(e.target.value))
                      }
                      className="w-32 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-white outline-none"
                    />
                  </div>

                  <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
                    <span className="text-white">Total</span>
                    <span className="text-white">{formatMoney(draftOrder.total)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={saveDraftOrder}
                  disabled={savingOrder}
                  className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {savingOrder ? "Saving..." : "Save Changes"}
                </button>

                <button
                  onClick={deleteSelectedOrder}
                  disabled={savingOrder}
                  className="w-full rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                >
                  {savingOrder ? "Working..." : "Delete Sale Log"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeTabContent = useMemo(() => {
    switch (activeTab) {
      case "sales_logs":
        return renderSalesLogs();
      case "material_purchase":
        return <MaterialPurchaseTab managerName="Management" />;
      case "product_management":
        return <ProductManagementTab />;
      case "commissions":
        return <CommissionsTab />;
      case "business_performance":
        return <BusinessPerformanceTab />;
      case "overview":
        return <OverviewTab onNavigate={setActiveTab} />;
      default:
        return renderSalesLogs();
    }
  }, [
    activeTab,
    weekOrders,
    selectedOrderId,
    draftOrder,
    saveMessage,
    weekRange,
    catalogProducts,
    loadingOrders,
    savingOrder,
  ]);

  return (
    <main className="min-h-screen text-white">
      <div className="px-5 py-4 md:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-32px)] max-w-[1500px] flex-col gap-3">
          <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
            <div className="flex items-center gap-2.5">
              {avatar ? (
                <img
                  src={avatar}
                  alt={displayName}
                  className="h-10 w-10 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/90 font-semibold text-white shadow-[0_10px_20px_rgba(220,38,38,0.28)]">
                  {displayName.charAt(0)}
                </div>
              )}

              <div>
                <div className="text-sm font-semibold tracking-tight text-white">
                  {displayName}
                </div>
                <div className="text-[11px] text-zinc-400">{rankLabel}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-zinc-300 md:block">
                Ammunation 60 Management
              </div>

              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.22)] transition hover:bg-red-500"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
            <aside className="col-span-12 flex h-full flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl xl:col-span-2">
              <div className="mb-3 rounded-[20px] border border-white/8 bg-black/20 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200">
                  Management
                </div>
                <h1 className="mt-2 text-lg font-bold tracking-tight text-white">
                  Control Center
                </h1>
                <p className="mt-1 text-[11px] leading-5 text-zinc-400">
                  Oversight for sales activity, pricing, commissions, materials, and weekly reporting.
                </p>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full rounded-[18px] border px-3.5 py-3 text-left text-sm font-medium transition ${
                      activeTab === tab.key
                        ? "border-red-400/20 bg-red-500/[0.08] text-white shadow-[inset_3px_0_0_0_rgba(248,113,113,0.9)]"
                        : "border-transparent bg-black/20 text-zinc-200 hover:border-white/8 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{tab.label}</span>
                      {activeTab === tab.key && (
                        <span className="h-2 w-2 rounded-full bg-red-300 shadow-[0_0_14px_rgba(252,165,165,0.7)]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="col-span-12 flex h-full min-h-0 flex-col rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl xl:col-span-10">
              <div className="mb-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Active View
                </div>
                <div className="mt-1 text-base font-semibold tracking-tight text-white">
                  {tabs.find((tab) => tab.key === activeTab)?.label}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1.5">
                {activeTabContent}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
