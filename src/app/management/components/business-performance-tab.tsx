"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredOrders } from "@/lib/gunstore/orders";
import { SavedOrder } from "@/lib/gunstore/types";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";
import {
  getStoredMaterialPurchases,
  MaterialPurchase,
} from "@/lib/gunstore/materials";
import {
  CommissionPayoutRecord,
  getStoredCommissionPayouts,
  getStoredDefaultCommissionRate,
} from "@/lib/gunstore/commissions";
import {
  exportBusinessPerformanceWorkbook,
  WeeklyBusinessSummary,
  WeeklyEmployeeCommission,
} from "@/lib/gunstore/export-business-performance";

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function getWeekStartKey(anchor: Date) {
  const { start } = getWeekRange(anchor);
  return start.toISOString();
}

export default function BusinessPerformanceTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [materials, setMaterials] = useState<MaterialPurchase[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(5);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setOrders(getStoredOrders());
    setMaterials(getStoredMaterialPurchases());
    setCommissionPayouts(getStoredCommissionPayouts());
    setDefaultCommissionRate(getStoredDefaultCommissionRate());
  }, []);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekStartKey = useMemo(() => getWeekStartKey(weekAnchor), [weekAnchor]);

  const weekOrders = useMemo(() => {
    return orders.filter((order) => isWithinWeek(order.createdAt, weekAnchor));
  }, [orders, weekAnchor]);

  const weekMaterials = useMemo(() => {
    return materials.filter((purchase) => isWithinWeek(purchase.createdAt, weekAnchor));
  }, [materials, weekAnchor]);

  const weeklyCommissions = useMemo<WeeklyEmployeeCommission[]>(() => {
    const grouped = new Map<string, number>();

    for (const order of weekOrders) {
      const current = grouped.get(order.employeeName) ?? 0;
      grouped.set(order.employeeName, current + order.total);
    }

    return Array.from(grouped.entries())
      .map(([employeeName, salesTotal]) => {
        const saved = commissionPayouts.find(
          (payout) =>
            payout.employeeName === employeeName &&
            payout.weekStart === weekStartKey
        );

        const commissionRate = saved?.commissionRate ?? defaultCommissionRate;
        const commissionEarned = Math.round(salesTotal * (commissionRate / 100));
        const status = saved?.status ?? "Unpaid";

        return {
          employeeName,
          salesTotal,
          commissionRate,
          commissionEarned,
          status,
        };
      })
      .sort((a, b) => b.salesTotal - a.salesTotal);
  }, [weekOrders, commissionPayouts, weekStartKey, defaultCommissionRate]);

  const summary = useMemo<WeeklyBusinessSummary>(() => {
    const salesRevenue = weekOrders.reduce((sum, order) => sum + order.total, 0);
    const discounts = weekOrders.reduce((sum, order) => sum + order.discount, 0);

    const materialExpensesTotal = weekMaterials.reduce(
      (sum, purchase) => sum + purchase.totalCost,
      0
    );

    const materialExpensesPaid = weekMaterials
      .filter((purchase) => purchase.reimbursementStatus === "Paid")
      .reduce((sum, purchase) => sum + purchase.totalCost, 0);

    const materialExpensesUnpaid = weekMaterials
      .filter((purchase) => purchase.reimbursementStatus === "Unpaid")
      .reduce((sum, purchase) => sum + purchase.totalCost, 0);

    const commissionTotal = weeklyCommissions.reduce(
      (sum, row) => sum + row.commissionEarned,
      0
    );

    const commissionPaid = weeklyCommissions
      .filter((row) => row.status === "Paid")
      .reduce((sum, row) => sum + row.commissionEarned, 0);

    const commissionUnpaid = weeklyCommissions
      .filter((row) => row.status === "Unpaid")
      .reduce((sum, row) => sum + row.commissionEarned, 0);

    const actualProfit = salesRevenue - materialExpensesPaid - commissionPaid;
    const projectedProfit = salesRevenue - materialExpensesTotal - commissionTotal;

    return {
      weekLabel: `${weekRange.start.toLocaleDateString()} - ${weekRange.end.toLocaleDateString()}`,
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
              Clean weekly sales vs expenses report.
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
              disabled={exporting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {exporting ? "Exporting..." : "Export XLSX"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 text-sm font-semibold text-white">
          Weekly Summary
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-white/10">
                <th className="pb-2 font-medium">Week</th>
                <th className="pb-2 font-medium">Sales Revenue</th>
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
    </div>
  );
}