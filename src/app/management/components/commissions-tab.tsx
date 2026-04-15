"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  CommissionPayoutRecord,
  CommissionRateRecord,
  CommissionStatus,
  getCommissionPayoutsFromSupabase,
  getCommissionRatesFromSupabase,
  getPersonOverridesFromSupabase,
  PersonOverrideRecord,
  saveCommissionRatesBatchInSupabase,
  upsertCommissionPayoutInSupabase,
  upsertPersonOverrideInSupabase,
} from "@/lib/gunstore/commissions";
import { getOrdersFromSupabase } from "@/lib/gunstore/orders";
import { buildWeeklyCommissionRows } from "@/lib/gunstore/reporting";
import { SavedOrder } from "@/lib/gunstore/types";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  active: boolean;
};

type EmployeeCommissionRow = {
  employeeName: string;
  role: string;
  salesCount: number;
  salesRevenue: number;
  totalProfit: number;
  totalCommission: number;
  status: CommissionStatus;
  notes: string;
};

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function isDateOnlyString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDisplayDate(value: string | Date) {
  if (typeof value === "string" && isDateOnlyString(value)) {
    return value;
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateKey(value: string | Date) {
  if (typeof value === "string" && isDateOnlyString(value)) {
    return value;
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartKey(anchor: Date) {
  const { start } = getWeekRange(anchor);
  return toDateKey(start);
}

function normalizeRole(role?: string) {
  const value = (role ?? "").toLowerCase();
  if (value.includes("management") || value.includes("manager")) {
    return "Management";
  }
  return "Employee";
}

export default function CommissionsTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [rates, setRates] = useState<CommissionRateRecord[]>([]);
  const [personOverrides, setPersonOverrides] = useState<PersonOverrideRecord[]>([]);
  const [products, setProducts] = useState<{ name: string; category: string }[]>([]);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [saveMessage, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRates, setSavingRates] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);

  const loadCommissionData = useCallback(async () => {
    setLoading(true);

    try {
      const [
        loadedOrders,
        loadedPayouts,
        loadedRates,
        loadedPersonOverrides,
        productsResult,
      ] = await Promise.all([
        getOrdersFromSupabase(),
        getCommissionPayoutsFromSupabase(),
        getCommissionRatesFromSupabase(),
        getPersonOverridesFromSupabase(),
        supabase
          .from("products")
          .select("id, name, category, active")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      setOrders(loadedOrders);
      setPayouts(loadedPayouts);
      setRates(loadedRates);
      setPersonOverrides(loadedPersonOverrides);

      const mappedProducts = ((productsResult.data ?? []) as ProductRow[]).map((p) => ({
        name: p.name,
        category: p.category,
      }));

      setProducts(mappedProducts);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load commissions.";
      showMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCommissionData();
  }, [loadCommissionData]);

  useEffect(() => {
    const channel = supabase
      .channel("commissions-dashboard-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => void loadCommissionData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => void loadCommissionData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_payouts" },
        () => void loadCommissionData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_rates" },
        () => void loadCommissionData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_person_overrides" },
        () => void loadCommissionData()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadCommissionData]);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekStartKey = useMemo(() => getWeekStartKey(weekAnchor), [weekAnchor]);

  const weekOrders = useMemo(() => {
    return orders.filter((order) => isWithinWeek(order.createdAt, weekAnchor));
  }, [orders, weekAnchor]);

  const commissionRows = useMemo(() => {
    const roleMap = new Map<string, string>();

    for (const order of weekOrders) {
      if (!roleMap.has(order.employeeName)) {
        roleMap.set(order.employeeName, normalizeRole(order.role));
      }
    }

    return buildWeeklyCommissionRows({
      weekOrders,
      commissionPayouts: payouts,
      commissionRates: rates,
      personOverrides,
      weekAnchor,
    }).map((row) => ({
      employeeName: row.employeeName,
      role: roleMap.get(row.employeeName) ?? "Employee",
      salesCount: row.salesCount,
      salesRevenue: row.salesTotal,
      totalProfit: row.totalProfit,
      totalCommission: row.commissionEarned,
      status: row.status,
      notes: row.notes,
    }));
  }, [weekAnchor, weekOrders, payouts, rates, personOverrides]);

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

  async function refreshPayouts() {
    const refreshed = await getCommissionPayoutsFromSupabase();
    setPayouts(refreshed);
  }

  async function upsertPayout(
    employeeName: string,
    updates: Partial<CommissionPayoutRecord>
  ) {
    const existing = payouts.find(
      (payout) =>
        payout.employeeName === employeeName &&
        toDateKey(payout.weekStart) === weekStartKey
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

      setPayouts((prev) => {
        const existingIndex = prev.findIndex(
          (payout) =>
            payout.employeeName === employeeName &&
            toDateKey(payout.weekStart) === weekStartKey
        );

        if (existingIndex >= 0) {
          const copy = [...prev];
          copy[existingIndex] = {
            ...copy[existingIndex],
            status: nextStatus,
            notes: nextNotes,
            weekStart: weekStartKey,
          };
          return copy;
        }

        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            weekStart: weekStartKey,
            employeeName,
            status: nextStatus,
            notes: nextNotes,
          },
        ];
      });

      await refreshPayouts();
      setDraftNotes((prev) => ({
        ...prev,
        [`${weekStartKey}:${employeeName}`]: nextNotes,
      }));
      showMessage(`${employeeName} marked ${nextStatus}.`);
    } catch (error) {
      console.error("Failed to save payout:", error);
      const message =
        error instanceof Error ? error.message : "Failed to save payout.";
      showMessage(message);
    } finally {
      setSavingPayout(false);
    }
  }

  function getRateForProduct(productName: string) {
    return Number(
      rates.find((rate) => rate.productName === productName)?.commissionPercent ?? 0
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
          productName: productName,
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

  function getPersonOverride(employeeName: string) {
    return Number(
      personOverrides.find((entry) => entry.employeeName === employeeName)
        ?.commissionPercent ?? 0
    );
  }

  function setPersonOverride(employeeName: string, value: number) {
    const existing = personOverrides.find(
      (entry) => entry.employeeName === employeeName
    );

    if (existing) {
      setPersonOverrides((prev) =>
        prev.map((entry) =>
          entry.employeeName === employeeName
            ? { ...entry, commissionPercent: Number(value) }
            : entry
        )
      );
      return;
    }

    setPersonOverrides((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        employeeName,
        commissionPercent: Number(value),
      },
    ]);
  }

  async function savePersonOverride(employeeName: string, value: number) {
    setSavingOverrides(true);

    try {
      await upsertPersonOverrideInSupabase({
        employeeName,
        commissionPercent: Number(value),
      });

      const refreshed = await getPersonOverridesFromSupabase();
      setPersonOverrides(refreshed);
      showMessage(`${employeeName} override updated.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save employee override.";
      showMessage(message);
    } finally {
      setSavingOverrides(false);
    }
  }

  const weeklyEmployees = useMemo(() => {
    return commissionRows.map((row) => ({
      employeeName: row.employeeName,
      role: row.role,
    }));
  }, [commissionRows]);

  function getDraftNote(row: EmployeeCommissionRow) {
    const key = `${weekStartKey}:${row.employeeName}`;
    return draftNotes[key] ?? row.notes;
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-white">
            Product Commission Rates
          </div>
          <div className="text-xs text-zinc-400">
            Product rates are the base rule. Any product set to 0% stays 0% even when a person override exists.
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
            {savingRates ? "Saving..." : "Save Product Rates"}
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
              Current week updates live from product rates and person overrides. Payout status flows into Overview and Business Performance.
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

        <div className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-3 text-sm font-semibold text-white">
            Employee Overrides
          </div>

          <div className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
            {weeklyEmployees.map((employee) => (
              <div
                key={employee.employeeName}
                className="flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm text-white">{employee.employeeName}</div>
                  <div className="text-[11px] text-zinc-500">{employee.role}</div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={getPersonOverride(employee.employeeName)}
                    onChange={(e) =>
                      setPersonOverride(employee.employeeName, Number(e.target.value))
                    }
                    className="w-24 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    onClick={() =>
                      savePersonOverride(
                        employee.employeeName,
                        getPersonOverride(employee.employeeName)
                      )
                    }
                    disabled={savingOverrides}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            ))}

            {weeklyEmployees.length === 0 && (
              <div className="text-sm text-zinc-400">
                No employees with sales this week.
              </div>
            )}
          </div>
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
                  <th className="pb-2 font-medium">Role</th>
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
                    <td className="py-3 text-zinc-300">{row.role}</td>
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
                        disabled={savingPayout}
                        className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none disabled:opacity-60"
                      >
                        <option value="Unpaid">Unpaid</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <input
                        value={getDraftNote(row)}
                        onChange={(e) =>
                          setDraftNotes((prev) => ({
                            ...prev,
                            [`${weekStartKey}:${row.employeeName}`]: e.target.value,
                          }))
                        }
                        onBlur={(e) =>
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
