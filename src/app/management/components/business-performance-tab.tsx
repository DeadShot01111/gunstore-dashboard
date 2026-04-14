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
import { supabase } from "@/lib/supabase/client";
import {
  exportBusinessPerformanceWorkbook,
  WeeklyBusinessSummary,
  WeeklyEmployeeCommission,
} from "@/lib/gunstore/export-business-performance";
import {
  buildWeeklyBusinessSummary,
  buildWeeklyCommissionRows,
  formatDisplayDate,
  getWeekMaterials,
  getWeekOrders,
} from "@/lib/gunstore/reporting";
import { getWeekRange } from "@/lib/gunstore/week";

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

export default function BusinessPerformanceTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [materials, setMaterials] = useState<MaterialPurchase[]>([]);
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [commissionRates, setCommissionRates] = useState<CommissionRateRecord[]>([]);
  const [personOverrides, setPersonOverrides] = useState<PersonOverrideRecord[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
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
      console.error("Failed to load business performance data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel("business-performance-dashboard-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_purchases" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_payouts" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_rates" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_person_overrides" },
        () => void loadData()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekOrders = useMemo(
    () => getWeekOrders(orders, weekAnchor),
    [orders, weekAnchor]
  );
  const weekMaterials = useMemo(
    () => getWeekMaterials(materials, weekAnchor),
    [materials, weekAnchor]
  );
  const commissionRows = useMemo(
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

  const weeklyCommissions = useMemo<WeeklyEmployeeCommission[]>(
    () =>
      commissionRows.map((row) => ({
        employeeName: row.employeeName,
        salesTotal: row.salesTotal,
        commissionRate: row.commissionRate,
        commissionEarned: row.commissionEarned,
        status: row.status,
      })),
    [commissionRows]
  );

  const summary = useMemo<WeeklyBusinessSummary>(
    () =>
      buildWeeklyBusinessSummary({
        weekOrders,
        weekMaterials,
        weeklyCommissions: commissionRows,
        weekAnchor,
      }),
    [weekOrders, weekMaterials, commissionRows, weekAnchor]
  );

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
      <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Reporting
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              Weekly Business Performance
            </div>
            <div className="text-xs text-zinc-400">
              Gross profit minus payouts for the selected week.
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
        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
          Loading business performance...
        </div>
      ) : (
        <>
          <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold text-white">Weekly Summary</div>

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
                    <td className="py-3 text-white">
                      {formatMoney(summary.materialExpensesTotal)}
                    </td>
                    <td className="py-3 text-white">{formatMoney(summary.commissionTotal)}</td>
                    <td className="py-3 text-green-300">{formatMoney(summary.actualProfit)}</td>
                    <td className="py-3 text-white">
                      {formatMoney(summary.projectedProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
            <div className="mb-3 text-sm font-semibold text-white">Expense Breakdown</div>

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
                    <td className="py-3 text-white">
                      {formatMoney(summary.materialExpensesTotal)}
                    </td>
                    <td className="py-3 text-green-300">
                      {formatMoney(summary.materialExpensesPaid)}
                    </td>
                    <td className="py-3 text-yellow-300">
                      {formatMoney(summary.materialExpensesUnpaid)}
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 text-white">Commissions</td>
                    <td className="py-3 text-white">{formatMoney(summary.commissionTotal)}</td>
                    <td className="py-3 text-green-300">{formatMoney(summary.commissionPaid)}</td>
                    <td className="py-3 text-yellow-300">
                      {formatMoney(summary.commissionUnpaid)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
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
                    <th className="pb-2 font-medium">Avg Rate</th>
                    <th className="pb-2 font-medium">Commission</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionRows.map((row) => (
                    <tr key={row.employeeName} className="border-b border-white/5">
                      <td className="py-3 text-white">{row.employeeName}</td>
                      <td className="py-3 text-white">{formatMoney(row.salesTotal)}</td>
                      <td className="py-3 text-green-300">
                        {formatMoney(row.totalProfit)}
                      </td>
                      <td className="py-3 text-white">{row.commissionRate}%</td>
                      <td className="py-3 text-white">
                        {formatMoney(row.commissionEarned)}
                      </td>
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

                  {commissionRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-400">
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
