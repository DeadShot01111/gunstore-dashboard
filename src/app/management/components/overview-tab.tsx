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

type ManagerTab =
  | "overview"
  | "sales_logs"
  | "material_purchase"
  | "product_management"
  | "commissions"
  | "business_performance";

type OverviewTabProps = {
  onNavigate: (tab: ManagerTab) => void;
};

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

export default function OverviewTab({ onNavigate }: OverviewTabProps) {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [materials, setMaterials] = useState<MaterialPurchase[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [weekAnchor] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOverviewData();
  }, []);

  async function loadOverviewData() {
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
      console.error("Failed to load overview data:", error);
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

  const weeklyCommissions = useMemo(() => {
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
          totalCommission: values.totalCommission,
          status: saved?.status ?? "Unpaid",
        };
      })
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }, [weekOrders, commissionPayouts, weekStartKey]);

  const metrics = useMemo(() => {
    const salesRevenue = weekOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
    const discounts = weekOrders.reduce((sum, order) => sum + Number(order.discount ?? 0), 0);
    const salesCount = weekOrders.length;

    const totalProfit = weekOrders.reduce(
      (sum, order) => sum + Number((order as any).totalProfit ?? 0),
      0
    );

    const materialExpensesTotal = weekMaterials.reduce(
      (sum, purchase) => sum + Number(purchase.totalCost ?? 0),
      0
    );

    const materialExpensesUnpaid = weekMaterials
      .filter((purchase) => purchase.reimbursementStatus === "Unpaid")
      .reduce((sum, purchase) => sum + Number(purchase.totalCost ?? 0), 0);

    const commissionTotal = weeklyCommissions.reduce(
      (sum, row) => sum + Number(row.totalCommission ?? 0),
      0
    );

    const commissionUnpaid = weeklyCommissions
      .filter((row) => row.status === "Unpaid")
      .reduce((sum, row) => sum + Number(row.totalCommission ?? 0), 0);

    const actualProfit =
      salesRevenue -
      weekMaterials
        .filter((purchase) => purchase.reimbursementStatus === "Paid")
        .reduce((sum, purchase) => sum + Number(purchase.totalCost ?? 0), 0) -
      weeklyCommissions
        .filter((row) => row.status === "Paid")
        .reduce((sum, row) => sum + Number(row.totalCommission ?? 0), 0);

    const projectedProfit =
      salesRevenue - materialExpensesTotal - commissionTotal;

    return {
      salesRevenue,
      discounts,
      salesCount,
      totalProfit,
      materialExpensesTotal,
      materialExpensesUnpaid,
      commissionTotal,
      commissionUnpaid,
      actualProfit,
      projectedProfit,
    };
  }, [weekOrders, weekMaterials, weeklyCommissions]);

  const topEmployee = weeklyCommissions[0] ?? null;

  const alerts = useMemo(() => {
    const items: string[] = [];

    if (metrics.materialExpensesUnpaid > 0) {
      items.push(
        `${formatMoney(metrics.materialExpensesUnpaid)} in unpaid material reimbursements`
      );
    }

    if (metrics.commissionUnpaid > 0) {
      items.push(
        `${formatMoney(metrics.commissionUnpaid)} in unpaid commissions`
      );
    }

    if (weekOrders.length === 0) {
      items.push("No sales logged for the current week");
    }

    return items;
  }, [metrics.materialExpensesUnpaid, metrics.commissionUnpaid, weekOrders.length]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Weekly Overview
            </div>
            <div className="text-xs text-zinc-400">
              {formatDisplayDate(weekRange.start)} - {formatDisplayDate(weekRange.end)}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate("sales_logs")}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Open Sales Logs
            </button>
            <button
              onClick={() => onNavigate("material_purchase")}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Open Materials
            </button>
            <button
              onClick={() => onNavigate("commissions")}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Open Commissions
            </button>
            <button
              onClick={() => onNavigate("business_performance")}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            >
              Open Performance
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
          Loading overview...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Sales Revenue</div>
              <div className="mt-2 text-2xl font-bold text-white">
                {formatMoney(metrics.salesRevenue)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {metrics.salesCount} sales this week
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Store Profit</div>
              <div className="mt-2 text-2xl font-bold text-green-300">
                {formatMoney(metrics.totalProfit)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Before expense payouts
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Material Expenses</div>
              <div className="mt-2 text-2xl font-bold text-white">
                {formatMoney(metrics.materialExpensesTotal)}
              </div>
              <div className="mt-1 text-xs text-yellow-300">
                Unpaid: {formatMoney(metrics.materialExpensesUnpaid)}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Actual Profit</div>
              <div className="mt-2 text-2xl font-bold text-green-300">
                {formatMoney(metrics.actualProfit)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Projected: {formatMoney(metrics.projectedProfit)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                Top Employee This Week
              </div>

              {!topEmployee ? (
                <div className="text-sm text-zinc-400">
                  No sales data available for this week.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-lg font-bold text-white">
                    {topEmployee.employeeName}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Revenue</span>
                    <span className="text-white">
                      {formatMoney(topEmployee.salesTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Profit</span>
                    <span className="text-green-300">
                      {formatMoney(topEmployee.totalProfit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Commission</span>
                    <span className="text-white">
                      {formatMoney(topEmployee.totalCommission)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                Management Alerts
              </div>

              {alerts.length === 0 ? (
                <div className="rounded-lg border border-green-400/20 bg-green-500/10 p-3 text-sm text-green-300">
                  No urgent items for this week.
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-yellow-400/20 bg-yellow-500/10 p-3 text-sm text-yellow-300"
                    >
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold text-white">
              Quick Weekly Snapshot
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr className="border-b border-white/10">
                    <th className="pb-2 font-medium">Metric</th>
                    <th className="pb-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Sales Revenue</td>
                    <td className="py-3 text-white">{formatMoney(metrics.salesRevenue)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Discounts Given</td>
                    <td className="py-3 text-green-300">{formatMoney(metrics.discounts)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Store Profit</td>
                    <td className="py-3 text-green-300">{formatMoney(metrics.totalProfit)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Total Material Expenses</td>
                    <td className="py-3 text-white">{formatMoney(metrics.materialExpensesTotal)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Total Commission Expenses</td>
                    <td className="py-3 text-white">{formatMoney(metrics.commissionTotal)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Actual Profit</td>
                    <td className="py-3 text-green-300">{formatMoney(metrics.actualProfit)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">Projected Profit</td>
                    <td className="py-3 text-white">{formatMoney(metrics.projectedProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}