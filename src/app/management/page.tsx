"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "next-auth/react";

import BusinessPerformanceTab from "@/app/management/components/business-performance-tab";
import CommissionsTab from "@/app/management/components/commissions-tab";
import MaterialPurchaseTab from "@/app/management/components/material-purchase-tab";
import ProductManagementTab from "@/app/management/components/product-management-tab";

import { getStoredCatalogProducts } from "@/lib/gunstore/catalog";
import { getStoredOrders, saveStoredOrders } from "@/lib/gunstore/orders";
import { recalcOrder } from "@/lib/gunstore/pricing";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";
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

const tabs: { key: ManagerTab; label: string }[] = [
  { key: "sales_logs", label: "Sales Logs" },
  { key: "material_purchase", label: "Material Purchase" },
  { key: "product_management", label: "Product Management" },
  { key: "commissions", label: "Commissions" },
  { key: "business_performance", label: "Business Performance" },
  { key: "overview", label: "Overview" },
];

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
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

export default function ManagementPage() {
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState<ManagerTab>("sales_logs");
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<SavedOrder | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setOrders(getStoredOrders());
    setCatalogProducts(getStoredCatalogProducts());
  }, []);

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

    setDraftOrder(recalcOrder(updated, catalogProducts));
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
        catalogProducts
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
        catalogProducts
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
        catalogProducts
      )
    );
  }

  function saveDraftOrder() {
    if (!draftOrder) return;

    const finalOrder = recalcOrder(
      {
        ...draftOrder,
        createdAt: new Date(draftOrder.createdAt).toISOString(),
        status: draftOrder.status ?? "Edited",
      },
      catalogProducts
    );

    const updatedOrders = orders.map((order) =>
      order.id === finalOrder.id ? finalOrder : order
    );

    setOrders(updatedOrders);
    saveStoredOrders(updatedOrders);

    setSaveMessage("Sales log updated.");
    setTimeout(() => setSaveMessage(""), 2200);
  }

  function deleteSelectedOrder() {
    if (!selectedOrderId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this sale log?"
    );

    if (!confirmed) return;

    const updatedOrders = orders.filter((order) => order.id !== selectedOrderId);

    setOrders(updatedOrders);
    saveStoredOrders(updatedOrders);
    setSelectedOrderId(null);
    setDraftOrder(null);

    setSaveMessage("Sales log deleted.");
    setTimeout(() => setSaveMessage(""), 2200);
  }

  const displayName =
    (session?.user as any)?.nickname || session?.user?.name || "Manager";

  const avatar =
    (session?.user as any)?.avatar || session?.user?.image || null;

  const rankLabel =
    (session?.user as any)?.role === "management"
      ? "Management"
      : (session?.user as any)?.role === "employee"
      ? "Employee"
      : "Unauthorized";

  function renderOverview() {
    const totalSales = weekOrders.reduce((sum, row) => sum + row.total, 0);
    const totalDiscounts = weekOrders.reduce((sum, row) => sum + row.discount, 0);
    const totalOrders = weekOrders.length;

    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-zinc-400">Week Sales</div>
          <div className="mt-2 text-2xl font-bold text-white">
            {formatMoney(totalSales)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-zinc-400">Week Discounts</div>
          <div className="mt-2 text-2xl font-bold text-green-300">
            {formatMoney(totalDiscounts)}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-zinc-400">Week Orders</div>
          <div className="mt-2 text-2xl font-bold text-white">{totalOrders}</div>
        </div>
      </div>
    );
  }

  function renderSalesLogs() {
    return (
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-7">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Weekly Sales Logs</div>
              <div className="text-xs text-zinc-400">
                Monday 12:01 AM to Sunday 11:59 PM
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
                {weekRange.start.toLocaleDateString()} - {weekRange.end.toLocaleDateString()}
              </div>

              <button
                onClick={() => shiftWeek("next")}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
              >
                Next Week
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            Do not delete any sales from the sales log table unless absolutely necessary. Use edits and notes to correct records when possible.
          </div>

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
                      selectedOrderId === row.id ? "bg-white/5" : ""
                    }`}
                  >
                    <td className="py-3 text-white">{formatDateTime(row.createdAt)}</td>
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
        </div>

        <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Sales Log Details</div>
              <div className="text-xs text-zinc-400">
                Select a log row to review and edit.
              </div>
            </div>

            {saveMessage && (
              <div className="text-xs text-green-300">{saveMessage}</div>
            )}
          </div>

          {!draftOrder ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
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
                    onChange={(e) => updateDraftField("status", e.target.value)}
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
                  className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Save Changes
                </button>

                <button
                  onClick={deleteSelectedOrder}
                  className="w-full rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20"
                >
                  Delete Sale Log
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
        return renderOverview();
      default:
        return renderSalesLogs();
    }
  }, [activeTab, weekOrders, selectedOrderId, draftOrder, saveMessage, weekRange, catalogProducts]);

  return (
    <main className="min-h-screen text-white">
      <div className="px-6 py-3">
        <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1480px] flex-col gap-2.5">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              {avatar ? (
                <img
                  src={avatar}
                  alt={displayName}
                  className="h-10 w-10 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 font-semibold text-white">
                  {displayName.charAt(0)}
                </div>
              )}

              <div>
                <div className="text-sm font-semibold text-white">
                  {displayName}
                </div>
                <div className="text-[11px] text-zinc-400">{rankLabel}</div>
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

          <div className="grid min-h-0 flex-1 grid-cols-12 gap-2.5">
            <aside className="col-span-12 flex h-full flex-col rounded-xl border border-white/10 bg-black/20 p-2.5 backdrop-blur-xl xl:col-span-2">
              <div className="mb-2.5 rounded-lg border border-white/10 bg-black/20 p-2.5">
                <h1 className="text-base font-bold">Management</h1>
                <p className="mt-0.5 text-[11px] text-zinc-400">Control center</p>
              </div>

              <div className="flex-1 space-y-1.5 overflow-y-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      activeTab === tab.key
                        ? "bg-red-600 text-white"
                        : "bg-black/20 text-zinc-200 hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </aside>

            <section className="col-span-12 flex h-full min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-2.5 backdrop-blur-xl xl:col-span-10">
              <div className="mb-2.5 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="text-sm font-semibold text-white">
                  {tabs.find((tab) => tab.key === activeTab)?.label}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {activeTabContent}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}