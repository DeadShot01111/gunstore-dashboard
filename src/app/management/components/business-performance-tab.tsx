"use client";

import { useEffect, useMemo, useState } from "react";
import { getOrdersFromSupabase } from "@/lib/gunstore/orders";
import { SavedOrder } from "@/lib/gunstore/types";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";
import {
  getStoredMaterialPurchases,
  MaterialPurchase,
} from "@/lib/gunstore/materials";
import {
  CommissionPayoutRecord,
  getCommissionPayoutsFromSupabase,
} from "@/lib/gunstore/commissions";
import {
  exportBusinessPerformanceWorkbook,
  WeeklyBusinessSummary,
  WeeklyEmployeeCommission,
} from "@/lib/gunstore/export-business-performance";

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

export default function BusinessPerformanceTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [materials, setMaterials] = useState<MaterialPurchase[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [loadedOrders, loadedPayouts] = await Promise.all([
        getOrdersFromSupabase(),
        getCommissionPayoutsFromSupabase(),
      ]);

      setOrders(loadedOrders);
      setCommissionPayouts(loadedPayouts);
      setMaterials(getStoredMaterialPurchases());
    } catch (error) {
      console.error("Failed to load business performance data:", error);
    } finally {
      setLoading(false);
    }
  }

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekStartKey = useMemo(() => getWeekStartKey(weekAnchor), [weekAnchor]);

  const weekOrders = useMemo(() => {
    return orders.filter((order) => isWithinWeek(order.createdAt, weekAnchor));
  }, [orders, weekAnchor]);

  const weekMaterials = useMemo(() => {
    return materials.filter((purchase) => isWithinWeek(purchase.createdAt, weekAnchor));
  }, [materials, weekAnchor]);

  const weeklyCommissions = useMemo<WeeklyEmployeeCommission[]>(() => {
    const grouped = new Map<
      string,
      {
        salesTotal: number;
        totalProfit: number;
        totalCommission: number;
      }
    >();

    for (const order of weekOrders) {
      const current = grouped.get(order.employeeName) ?? {
        salesTotal: 0,
        totalProfit: 0,
        totalCommission: 0,
      };

      const computedCommission = Array.isArray(order.items)
        ? order.items.reduce(
            (sum, item) => sum + Number((item as any).commissionEarned ?? 0),
            0
          )
        : Number((order as any).totalCommission ?? 0);

      grouped.set(order.employeeName, {
        salesTotal: current.salesTotal + Number(order.total ?? 0),
        totalProfit: current.totalProfit + Number((order as any).totalProfit ?? 0),
        totalCommission: current.totalCommission + computedCommission,
      });
    }

    return Array.from(grouped.entries())
      .map(([employeeName, values]) => {
        const saved = commissionPayouts.find(
          (payout) =>
            payout.employeeName === employeeName &&
            payout.weekStart === weekStartKey
        );

        return {
          employeeName,
          salesTotal: values.salesTotal,
          totalProfit: values.totalProfit,
          commissionRate: 0,
          commissionEarned: values.totalCommission,
          status: saved?.status ?? "Unpaid",
        };
      })
      .sort((a, b) => b.commissionEarned - a.commissionEarned);
  }, [weekOrders, commissionPayouts, weekStartKey]);

  const summary = useMemo<WeeklyBusinessSummary>(() => {
    const salesRevenue = weekOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
    const discounts = weekOrders.reduce((sum, order) => sum + Number(order.discount ?? 0), 0);

    const materialExpensesTotal = weekMaterials.reduce(
      (sum, purchase) => sum + Number(purchase.totalCost ?? 0),
      0
    );

    const materialExpensesPaid = weekMaterials
      .filter((purchase) => purchase.reimbursementStatus === "Paid")
      .reduce((sum, purchase) => sum + Number(purchase.totalCost ?? 0), 0);

    const materialExpensesUnpaid = weekMaterials
      .filter((purchase) => purchase.reimbursementStatus === "Unpaid")
      .reduce((sum, purchase) => sum + Number(purchase.totalCost ?? 0), 0);

    const commissionTotal = weeklyCommissions.reduce(
      (sum, row) => sum + Number(row.commissionEarned ?? 0),
      0
    );

    const commissionPaid = weeklyCommissions
      .filter((row) => row.status === "Paid")
      .reduce((sum, row) => sum + Number(row.commissionEarned ?? 0), 0);

    const commissionUnpaid = weeklyCommissions
      .filter((row) => row.status === "Unpaid")
      .reduce((sum, row) => sum + Number(row.commissionEarned ?? 0), 0);

    const actualProfit = salesRevenue - materialExpensesPaid - commissionPaid;
    const projectedProfit = salesRevenue - materialExpensesTotal - commissionTotal;

    return {
      weekLabel: `${formatDisplayDate(weekRange.start)} - ${formatDisplayDate(weekRange.end)}`,
      salesRevenue,
      discounts,
      materialExpensesTotal,
      materialExpensesPaid,
      materialExpensesUnpaid,
      commissionTotal,
      commissionPaid,
      commissionUnpaid,
      actualProfit,
      projectedProfit,
    };
  }, [weekOrders, weekMaterials, weeklyCommissions, weekRange]);

  function shiftWeek(direction: "prev" | "next") {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (direction === "prev" ? -7 : 7));
      return next;
    });
  }

  async function handleExport() {
    try {
      setExporting(true);
      await exportBusinessPerformanceWorkbook({
        summary,
        weeklyCommissions,
        weekMaterials,
        weekOrders,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Weekly Business Performance
            </div>
            <div className="text-xs text-zinc-400">
              Profit-based reporting for the selected week.
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
              {summary.weekLabel}
            </div>

            <button
              onClick={() => shiftWeek("next")}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Next Week
            </button>

            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {exporting ? "Exporting..." : "Export XLSX"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
          Loading business performance...
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold text-white">
              Weekly Summary
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr className="border-b border-white/10">
                    <th className="pb-2 font-medium">Week</th>
                    <th className="pb-2 font-medium">Revenue</th>
                    <th className="pb-2 font-medium">Discounts</th>
                    <th className="pb-2 font-medium">Material Expenses</th>
                    <th className="pb-2 font-medium">Commission Expenses</th>
                    <th className="pb-2 font-medium">Actual Profit</th>
                    <th className="pb-2 font-medium">Projected Profit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">{summary.weekLabel}</td>
                    <td className="py-3 text-white">{formatMoney(summary.salesRevenue)}</td>
                    <td className="py-3 text-green-300">{formatMoney(summary.discounts)}</td>
                    <td className="py-3 text-white">{formatMoney(summary.materialExpensesTotal)}</td>
                    <td className="py-3 text-white">{formatMoney(summary.commissionTotal)}</td>
                    <td className="py-3 text-green-300">{formatMoney(summary.actualProfit)}</td>
                    <td className="py-3 text-white">{formatMoney(summary.projectedProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold text-white">
              Expense Breakdown
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr className="border-b border-white/10">
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Paid</th>
                    <th className="pb-2 font-medium">Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Material Purchases</td>
                    <td className="py-3 text-white">{formatMoney(summary.materialExpensesTotal)}</td>
                    <td className="py-3 text-green-300">{formatMoney(summary.materialExpensesPaid)}</td>
                    <td className="py-3 text-yellow-300">{formatMoney(summary.materialExpensesUnpaid)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Commissions</td>
                    <td className="py-3 text-white">{formatMoney(summary.commissionTotal)}</td>
                    <td className="py-3 text-green-300">{formatMoney(summary.commissionPaid)}</td>
                    <td className="py-3 text-yellow-300">{formatMoney(summary.commissionUnpaid)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold text-white">
              Commission Breakdown
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr className="border-b border-white/10">
                    <th className="pb-2 font-medium">Employee</th>
                    <th className="pb-2 font-medium">Revenue</th>
                    <th className="pb-2 font-medium">Profit</th>
                    <th className="pb-2 font-medium">Commission</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyCommissions.map((row) => (
                    <tr key={row.employeeName} className="border-b border-white/5">
                      <td className="py-3 text-white">{row.employeeName}</td>
                      <td className="py-3 text-white">{formatMoney(row.salesTotal)}</td>
                      <td className="py-3 text-green-300">{formatMoney(Number((row as any).totalProfit ?? 0))}</td>
                      <td className="py-3 text-white">{formatMoney(row.commissionEarned)}</td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            row.status === "Paid"
                              ? "border border-green-400/20 bg-green-500/15 text-green-300"
                              : "border border-yellow-400/20 bg-yellow-500/15 text-yellow-300"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {weeklyCommissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-zinc-400">
                        No commission records for this week.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}