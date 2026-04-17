"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getOrdersFromSupabase } from "@/lib/gunstore/orders";
import { SavedOrder } from "@/lib/gunstore/types";
import {
  getMaterialPurchasesFromSupabase,
  MaterialPurchase,
} from "@/lib/gunstore/materials";
import {
  CommissionPayoutRecord,
  CommissionRateRecord,
  getCommissionPayoutsFromSupabase,
  getCommissionRatesFromSupabase,
  getPersonOverridesFromSupabase,
  PersonOverrideRecord,
} from "@/lib/gunstore/commissions";
import {
  buildWeeklyBusinessSummary,
  buildWeeklyCommissionRows,
  getWeekMaterials,
  getWeekOrders,
} from "@/lib/gunstore/reporting";
import { supabase } from "@/lib/supabase/client";

type ManagerTab =
  | "overview"
  | "sales_logs"
  | "craft_calculator"
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

export default function OverviewTab({ onNavigate }: OverviewTabProps) {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [materials, setMaterials] = useState<MaterialPurchase[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [commissionRates, setCommissionRates] = useState<CommissionRateRecord[]>([]);
  const [personOverrides, setPersonOverrides] = useState<PersonOverrideRecord[]>([]);
  const [weekAnchor] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const loadOverviewData = useCallback(async () => {
    setLoading(true);

    try {
      const [
        loadedOrders,
        loadedPayouts,
        loadedRates,
        loadedMaterials,
        loadedPersonOverrides,
      ] =
        await Promise.all([
          getOrdersFromSupabase(),
          getCommissionPayoutsFromSupabase(),
          getCommissionRatesFromSupabase(),
          getMaterialPurchasesFromSupabase(),
          getPersonOverridesFromSupabase(),
        ]);

      setOrders(loadedOrders);
      setCommissionPayouts(loadedPayouts);
      setCommissionRates(loadedRates);
      setMaterials(loadedMaterials);
      setPersonOverrides(loadedPersonOverrides);
    } catch (error) {
      console.error("Failed to load overview data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverviewData();
  }, [loadOverviewData]);

  useEffect(() => {
    const channel = supabase
      .channel("overview-dashboard-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void loadOverviewData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void loadOverviewData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_purchases" },
        () => void loadOverviewData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_payouts" },
        () => void loadOverviewData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_rates" },
        () => void loadOverviewData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_person_overrides" },
        () => void loadOverviewData()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadOverviewData]);

  const weekOrders = useMemo(
    () => getWeekOrders(orders, weekAnchor),
    [orders, weekAnchor]
  );
  const weekMaterials = useMemo(
    () => getWeekMaterials(materials, weekAnchor),
    [materials, weekAnchor]
  );
  const weeklyCommissions = useMemo(
    () =>
      buildWeeklyCommissionRows({
        weekOrders,
        commissionPayouts,
        commissionRates,
        personOverrides,
        weekAnchor,
      }),
    [weekOrders, commissionPayouts, commissionRates, personOverrides, weekAnchor]
  );
  const metrics = useMemo(
    () =>
      buildWeeklyBusinessSummary({
        weekOrders,
        weekMaterials,
        weeklyCommissions,
        weekAnchor,
      }),
    [weekOrders, weekMaterials, weeklyCommissions, weekAnchor]
  );

  const topEmployee = weeklyCommissions[0] ?? null;

  const alerts = useMemo(() => {
    const items: string[] = [];

    if (metrics.materialExpensesUnpaid > 0) {
      items.push(
        `${formatMoney(metrics.materialExpensesUnpaid)} in unpaid material reimbursements`
      );
    }

    if (metrics.commissionUnpaid > 0) {
      items.push(`${formatMoney(metrics.commissionUnpaid)} in unpaid commissions`);
    }

    if (weekOrders.length === 0) {
      items.push("No sales logged for the current week");
    }

    return items;
  }, [
    metrics.commissionUnpaid,
    metrics.materialExpensesUnpaid,
    weekOrders.length,
  ]);

  return (
    <div className="space-y-3">
      <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Snapshot
            </div>
            <div className="mt-1 text-sm font-semibold text-white">Weekly Overview</div>
            <div className="text-xs text-zinc-400">{metrics.weekLabel}</div>
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
        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
          Loading overview...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Sales Revenue</div>
              <div className="mt-2 text-2xl font-bold text-white">
                {formatMoney(metrics.salesRevenue)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {weekOrders.length} sales this week
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Store Gross Profit</div>
              <div className="mt-2 text-2xl font-bold text-green-300">
                {formatMoney(
                  weekOrders.reduce(
                    (sum, order) => sum + Number(order.totalProfit ?? 0),
                    0
                  )
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Before material reimbursements and commission payouts
              </div>
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="text-xs text-zinc-400">Material Expenses</div>
              <div className="mt-2 text-2xl font-bold text-white">
                {formatMoney(metrics.materialExpensesTotal)}
              </div>
              <div className="mt-1 text-xs text-yellow-300">
                Unpaid: {formatMoney(metrics.materialExpensesUnpaid)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
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
                      {formatMoney(topEmployee.commissionEarned)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="mb-3 text-sm font-semibold text-white">
                Management Alerts
              </div>

              {alerts.length === 0 ? (
                <div className="rounded-lg border border-green-400/20 bg-green-500/10 p-3 text-sm text-green-300">
                  No urgent items for this week.
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <div
                      key={alert}
                      className="rounded-lg border border-yellow-400/20 bg-yellow-500/10 p-3 text-sm text-yellow-300"
                    >
                      {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
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
                    <td className="py-3 text-white">Week</td>
                    <td className="py-3 text-white">{metrics.weekLabel}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Sales Revenue</td>
                    <td className="py-3 text-white">{formatMoney(metrics.salesRevenue)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Discounts Given</td>
                    <td className="py-3 text-green-300">{formatMoney(metrics.discounts)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Total Material Expenses</td>
                    <td className="py-3 text-white">
                      {formatMoney(metrics.materialExpensesTotal)}
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Total Commission Expenses</td>
                    <td className="py-3 text-white">
                      {formatMoney(metrics.commissionTotal)}
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Actual Profit</td>
                    <td className="py-3 text-green-300">
                      {formatMoney(metrics.actualProfit)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 text-white">Projected Profit</td>
                    <td className="py-3 text-white">
                      {formatMoney(metrics.projectedProfit)}
                    </td>
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
