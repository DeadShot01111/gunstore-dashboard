"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredCatalogProducts } from "@/lib/gunstore/catalog";
import {
  CommissionPayoutRecord,
  CommissionRateRecord,
  CommissionStatus,
  getCommissionPayoutsFromSupabase,
  getCommissionRatesFromSupabase,
  saveCommissionRatesBatchInSupabase,
  upsertCommissionPayoutInSupabase,
} from "@/lib/gunstore/commissions";
import { getOrdersFromSupabase } from "@/lib/gunstore/orders";
import { SavedOrder } from "@/lib/gunstore/types";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function formatDisplayDate(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartKey(anchor: Date) {
  const { start } = getWeekRange(anchor);
  return start.toISOString();
}

type EmployeeCommissionRow = {
  employeeName: string;
  salesCount: number;
  salesRevenue: number;
  totalProfit: number;
  totalCommission: number;
  status: CommissionStatus;
  notes: string;
};

export default function CommissionsTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [rates, setRates] = useState<CommissionRateRecord[]>([]);
  const [products, setProducts] = useState<{ name: string; category: string }[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [saveMessage, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRates, setSavingRates] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  useEffect(() => {
    void loadCommissionData();
  }, []);

  async function loadCommissionData() {
    setLoading(true);

    try {
      const [loadedOrders, loadedPayouts, loadedRates] = await Promise.all([
        getOrdersFromSupabase(),
        getCommissionPayoutsFromSupabase(),
        getCommissionRatesFromSupabase(),
      ]);

      setOrders(loadedOrders);
      setPayouts(loadedPayouts);
      setRates(loadedRates);

      const catalog = getStoredCatalogProducts();
      setProducts(
        catalog
          .map((p) => ({ name: p.name, category: p.category }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load commissions.";
      showMessage(message);
    } finally {
      setLoading(false);
    }
  }

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekStartKey = useMemo(() => getWeekStartKey(weekAnchor), [weekAnchor]);

  const weekOrders = useMemo(() => {
    return orders.filter((order) => isWithinWeek(order.createdAt, weekAnchor));
  }, [orders, weekAnchor]);

  const commissionRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        salesCount: number;
        salesRevenue: number;
        totalProfit: number;
        totalCommission: number;
      }
    >();

    for (const order of weekOrders) {
      const current = grouped.get(order.employeeName) ?? {
        salesCount: 0,
        salesRevenue: 0,
        totalProfit: 0,
        totalCommission: 0,
      };

      const orderProfit =
        typeof (order as any).totalProfit === "number"
          ? Number((order as any).totalProfit)
          : Array.isArray(order.items)
          ? order.items.reduce(
              (sum, item) => sum + Number((item as any).totalProfit ?? 0),
              0
            )
          : 0;

      const orderCommission = Array.isArray(order.items)
        ? order.items.reduce(
            (sum, item) => sum + Number((item as any).commissionEarned ?? 0),
            0
          )
        : Number((order as any).totalCommission ?? 0);

      grouped.set(order.employeeName, {
        salesCount: current.salesCount + 1,
        salesRevenue: current.salesRevenue + Number(order.total ?? 0),
        totalProfit: current.totalProfit + orderProfit,
        totalCommission: current.totalCommission + orderCommission,
      });
    }

    return Array.from(grouped.entries())
      .map(([employeeName, values]) => {
        const savedPayout = payouts.find(
          (payout) =>
            payout.employeeName === employeeName &&
            payout.weekStart === weekStartKey
        );

        return {
          employeeName,
          salesCount: values.salesCount,
          salesRevenue: values.salesRevenue,
          totalProfit: values.totalProfit,
          totalCommission: values.totalCommission,
          status: savedPayout?.status ?? "Unpaid",
          notes: savedPayout?.notes ?? "",
        } as EmployeeCommissionRow;
      })
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }, [weekOrders, payouts, weekStartKey]);

  const totals = useMemo(() => {
    const totalRevenue = commissionRows.reduce(
      (sum, row) => sum + row.salesRevenue,
      0
    );
    const totalProfit = commissionRows.reduce(
      (sum, row) => sum + row.totalProfit,
      0
    );
    const totalCommission = commissionRows.reduce(
      (sum, row) => sum + row.totalCommission,
      0
    );
    const paidCommission = commissionRows
      .filter((row) => row.status === "Paid")
      .reduce((sum, row) => sum + row.totalCommission, 0);
    const unpaidCommission = commissionRows
      .filter((row) => row.status === "Unpaid")
      .reduce((sum, row) => sum + row.totalCommission, 0);

    return {
      totalRevenue,
      totalProfit,
      totalCommission,
      paidCommission,
      unpaidCommission,
    };
  }, [commissionRows]);

  function showMessage(message: string) {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 2200);
  }

  function shiftWeek(direction: "prev" | "next") {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (direction === "prev" ? -7 : 7));
      return next;
    });
  }

  async function upsertPayout(
    employeeName: string,
    updates: Partial<CommissionPayoutRecord>
  ) {
    const existing = payouts.find(
      (payout) =>
        payout.employeeName === employeeName && payout.weekStart === weekStartKey
    );

    const nextStatus = (updates.status ??
      existing?.status ??
      "Unpaid") as CommissionStatus;
    const nextNotes = updates.notes ?? existing?.notes ?? "";

    setSavingPayout(true);

    try {
      await upsertCommissionPayoutInSupabase({
        weekStart: weekStartKey,
        employeeName,
        status: nextStatus,
        notes: nextNotes,
      });

      const refreshed = await getCommissionPayoutsFromSupabase();
      setPayouts(refreshed);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save payout.";
      showMessage(message);
    } finally {
      setSavingPayout(false);
    }
  }

  async function markAllPaid() {
    setSavingPayout(true);

    try {
      for (const row of commissionRows) {
        await upsertCommissionPayoutInSupabase({
          weekStart: weekStartKey,
          employeeName: row.employeeName,
          status: "Paid",
          notes: row.notes ?? "",
        });
      }

      const refreshed = await getCommissionPayoutsFromSupabase();
      setPayouts(refreshed);
      showMessage("All commissions marked as paid.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update payouts.";
      showMessage(message);
    } finally {
      setSavingPayout(false);
    }
  }

  function getRateForProduct(productName: string) {
    return Number(
      rates.find((rate) => rate.productName === productName)?.commissionPercent ??
        0
    );
  }

  function updateRate(productName: string, commissionPercent: number) {
    const existing = rates.find((rate) => rate.productName === productName);

    let next: CommissionRateRecord[];

    if (existing) {
      next = rates.map((rate) =>
        rate.productName === productName
          ? { ...rate, commissionPercent: Number(commissionPercent) }
          : rate
      );
    } else {
      next = [
        ...rates,
        {
          id: crypto.randomUUID(),
          productName,
          commissionPercent: Number(commissionPercent),
        },
      ];
    }

    setRates(next);
  }

  async function saveRateChanges() {
    setSavingRates(true);

    try {
      await saveCommissionRatesBatchInSupabase(rates);
      const refreshed = await getCommissionRatesFromSupabase();
      setRates(refreshed);
      showMessage("Commission rates updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save rates.";
      showMessage(message);
    } finally {
      setSavingRates(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-white">
            Product Commission Rates
          </div>
          <div className="text-xs text-zinc-400">
            Manager-only commission percentages based on profit by product.
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="grid grid-cols-[1fr_110px] gap-3 text-xs text-zinc-400">
            <div>Product</div>
            <div>Commission %</div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
            Loading commission data...
          </div>
        ) : (
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {products.map((product) => (
              <div
                key={product.name}
                className="rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <div className="grid grid-cols-[1fr_110px] items-center gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">
                      {product.name}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {product.category}
                    </div>
                  </div>

                  <input
                    type="number"
                    min="0"
                    value={getRateForProduct(product.name)}
                    onChange={(e) =>
                      updateRate(product.name, Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>
            ))}

            {products.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No products found.
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={saveRateChanges}
            disabled={savingRates || loading}
            className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {savingRates ? "Saving..." : "Save Commission Rates"}
          </button>
        </div>

        {saveMessage && (
          <div className="mt-3 rounded-lg border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            {saveMessage}
          </div>
        )}
      </div>

      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-8">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Weekly Commissions
            </div>
            <div className="text-xs text-zinc-400">
              Based on actual saved order profit and manager-set commission rates.
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

        <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Weekly Revenue</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(totals.totalRevenue)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Weekly Profit</div>
            <div className="mt-1 text-xl font-bold text-green-300">
              {formatMoney(totals.totalProfit)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Total Commission</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(totals.totalCommission)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Still Owed</div>
            <div className="mt-1 text-xl font-bold text-yellow-300">
              {formatMoney(totals.unpaidCommission)}
            </div>
          </div>
        </div>

        <div className="mb-4 flex justify-end">
          <button
            onClick={markAllPaid}
            disabled={savingPayout || loading}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {savingPayout ? "Saving..." : "Mark All Paid"}
          </button>
        </div>

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
            Loading weekly commissions...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-400">
                <tr className="border-b border-white/10">
                  <th className="pb-2 font-medium">Employee</th>
                  <th className="pb-2 font-medium">Sales</th>
                  <th className="pb-2 font-medium">Revenue</th>
                  <th className="pb-2 font-medium">Profit</th>
                  <th className="pb-2 font-medium">Commission</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Notes</th>
                </tr>
              </thead>

              <tbody>
                {commissionRows.map((row) => (
                  <tr key={row.employeeName} className="border-b border-white/5">
                    <td className="py-3 text-white">{row.employeeName}</td>
                    <td className="py-3 text-white">{row.salesCount}</td>
                    <td className="py-3 text-white">
                      {formatMoney(row.salesRevenue)}
                    </td>
                    <td className="py-3 text-green-300">
                      {formatMoney(row.totalProfit)}
                    </td>
                    <td className="py-3 text-white">
                      {formatMoney(row.totalCommission)}
                    </td>
                    <td className="py-3">
                      <select
                        value={row.status}
                        onChange={(e) =>
                          void upsertPayout(row.employeeName, {
                            status: e.target.value as CommissionStatus,
                          })
                        }
                        className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none"
                      >
                        <option value="Unpaid">Unpaid</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <input
                        value={row.notes}
                        onChange={(e) =>
                          void upsertPayout(row.employeeName, {
                            notes: e.target.value,
                          })
                        }
                        placeholder="Notes..."
                        className="w-full min-w-[160px] rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-zinc-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {commissionRows.length === 0 && (
              <div className="py-8 text-center text-sm text-zinc-400">
                No profit-based commission records found for this week.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}