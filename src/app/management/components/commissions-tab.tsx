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
import { SavedOrder } from "@/lib/gunstore/types";
import {
  buildWeeklyCommissionRows,
  formatDisplayDate,
  getWeekOrders,
  getWeekStartKey,
} from "@/lib/gunstore/reporting";
import { getWeekRange } from "@/lib/gunstore/week";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  active: boolean;
};

type RowDraft = {
  status: CommissionStatus;
  notes: string;
};

type OverrideDrafts = Record<string, number>;

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function normalizeRole(role?: string) {
  const value = (role ?? "").toLowerCase();
  if (value.includes("management") || value.includes("manager")) {
    return "Management";
  }
  return "Employee";
}

function rowKey(employeeName: string, weekStart: string) {
  return `${employeeName}__${weekStart}`;
}

export default function CommissionsTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [rates, setRates] = useState<CommissionRateRecord[]>([]);
  const [personOverrides, setPersonOverrides] = useState<PersonOverrideRecord[]>([]);
  const [products, setProducts] = useState<{ name: string; category: string }[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<OverrideDrafts>({});
  const [saveMessage, setSaveMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingRates, setSavingRates] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);

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
      setProducts(
        ((productsResult.data ?? []) as ProductRow[]).map((product) => ({
          name: product.name,
          category: product.category,
        }))
      );
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
        { event: "*", schema: "public", table: "commission_person_overrides" },
        () => void loadCommissionData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commission_rates" },
        () => void loadCommissionData()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadCommissionData]);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekStartKey = useMemo(() => getWeekStartKey(weekAnchor), [weekAnchor]);
  const weekOrders = useMemo(
    () => getWeekOrders(orders, weekAnchor),
    [orders, weekAnchor]
  );
  const commissionRows = useMemo(
    () =>
      buildWeeklyCommissionRows({
        weekOrders,
        commissionPayouts: payouts,
        commissionRates: rates,
        personOverrides,
        weekAnchor,
      }),
    [weekOrders, payouts, rates, personOverrides, weekAnchor]
  );

  useEffect(() => {
    setDrafts((prev) => {
      const nextDrafts: Record<string, RowDraft> = {};

      for (const row of commissionRows) {
        const key = rowKey(row.employeeName, weekStartKey);
        nextDrafts[key] = prev[key] ?? {
          status: row.status,
          notes: row.notes,
        };
      }

      return nextDrafts;
    });
  }, [commissionRows, weekStartKey]);

  useEffect(() => {
    setOverrideDrafts((prev) => {
      const nextOverrideDrafts: OverrideDrafts = {};

      for (const row of commissionRows) {
        nextOverrideDrafts[row.employeeName] =
          prev[row.employeeName] ??
          Number(
            personOverrides.find((entry) => entry.employeeName === row.employeeName)
              ?.commissionPercent ?? 0
          );
      }

      return nextOverrideDrafts;
    });
  }, [commissionRows, personOverrides]);

  const totals = useMemo(() => {
    const totalRevenue = commissionRows.reduce(
      (sum, row) => sum + row.salesTotal,
      0
    );
    const totalProfit = commissionRows.reduce(
      (sum, row) => sum + row.totalProfit,
      0
    );
    const totalCommission = commissionRows.reduce(
      (sum, row) => sum + row.commissionEarned,
      0
    );
    const paidCommission = commissionRows.reduce((sum, row) => {
      const draft = drafts[rowKey(row.employeeName, weekStartKey)];
      return sum + ((draft?.status ?? row.status) === "Paid" ? row.commissionEarned : 0);
    }, 0);
    const unpaidCommission = commissionRows.reduce((sum, row) => {
      const draft = drafts[rowKey(row.employeeName, weekStartKey)];
      return sum + ((draft?.status ?? row.status) === "Unpaid" ? row.commissionEarned : 0);
    }, 0);

    return {
      totalRevenue,
      totalProfit,
      totalCommission,
      paidCommission,
      unpaidCommission,
    };
  }, [commissionRows, drafts, weekStartKey]);

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

  function updateRowDraft(employeeName: string, patch: Partial<RowDraft>) {
    return setDrafts((prev) => {
      const key = rowKey(employeeName, weekStartKey);
      const nextDraft = {
        status: prev[key]?.status ?? "Unpaid",
        notes: prev[key]?.notes ?? "",
        ...patch,
      };

      return {
        ...prev,
        [key]: nextDraft,
      };
    });
  }

  async function saveRow(employeeName: string) {
    const key = rowKey(employeeName, weekStartKey);
    const draft = drafts[key];

    if (!draft) return;

    setSavingRowKey(key);

    try {
      await upsertCommissionPayoutInSupabase({
        weekStart: weekStartKey,
        employeeName,
        status: draft.status,
        notes: draft.notes,
      });

      const refreshed = await getCommissionPayoutsFromSupabase();
      setPayouts(refreshed);
      showMessage(`${employeeName} payout saved.`);
    } catch (error) {
      console.error(error);
      showMessage("Failed to save payout.");
    } finally {
      setSavingRowKey(null);
    }
  }

  function getRateForProduct(productName: string) {
    return Number(
      rates.find((rate) => rate.productName === productName)?.commissionPercent ?? 0
    );
  }

  function updateRate(productName: string, commissionPercent: number) {
    const existing = rates.find((rate) => rate.productName === productName);

    if (existing) {
      setRates((prev) =>
        prev.map((rate) =>
          rate.productName === productName
            ? { ...rate, commissionPercent: Number(commissionPercent) }
            : rate
        )
      );
      return;
    }

    setRates((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productName,
        commissionPercent: Number(commissionPercent),
      },
    ]);
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

  function getSavedPersonOverride(employeeName: string) {
    return Number(
      personOverrides.find((entry) => entry.employeeName === employeeName)
        ?.commissionPercent ?? 0
    );
  }

  function getOverrideDraft(employeeName: string) {
    return Number(overrideDrafts[employeeName] ?? getSavedPersonOverride(employeeName));
  }

  function setOverrideDraft(employeeName: string, value: number) {
    setOverrideDrafts((prev) => ({
      ...prev,
      [employeeName]: Number(value),
    }));
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
      setOverrideDrafts((prev) => ({
        ...prev,
        [employeeName]: Number(value),
      }));
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
    return commissionRows.map((row) => {
      const matchingOrder = weekOrders.find(
        (order) => order.employeeName === row.employeeName
      );

      return {
        employeeName: row.employeeName,
        role: normalizeRole(matchingOrder?.role),
      };
    });
  }, [commissionRows, weekOrders]);

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] xl:col-span-4">
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Configuration
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            Product Commission Rates
          </div>
          <div className="text-xs text-zinc-400">
            New sales save product commission rates into each order item. Employee overrides replace the rate across that employee&apos;s sold profit for the selected week.
          </div>
        </div>

        <div className="mb-3 rounded-[18px] border border-white/8 bg-black/20 p-3">
          <div className="grid grid-cols-[1fr_110px] gap-3 text-xs text-zinc-400">
            <div>Product</div>
            <div>Commission %</div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
            Loading commission data...
          </div>
        ) : (
          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {products.map((product) => (
              <div
                key={product.name}
                className="rounded-[18px] border border-white/8 bg-black/20 p-3"
              >
                <div className="grid grid-cols-[1fr_110px] items-center gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">
                      {product.name}
                    </div>
                    <div className="text-[11px] text-zinc-500">{product.category}</div>
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
          <div className="mt-3 rounded-[18px] border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
            {saveMessage}
          </div>
        )}
      </div>

      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] xl:col-span-8">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Weekly Reporting
            </div>
            <div className="mt-1 text-sm font-semibold text-white">Weekly Commissions</div>
            <div className="text-xs text-zinc-400">
              Weekly payouts use the saved product rates by default. If an employee override is set, that override becomes the applied rate for that employee&apos;s weekly sales.
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
          <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Weekly Revenue</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(totals.totalRevenue)}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Weekly Profit</div>
            <div className="mt-1 text-xl font-bold text-green-300">
              {formatMoney(totals.totalProfit)}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Total Commission</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(totals.totalCommission)}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/8 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Still Owed</div>
            <div className="mt-1 text-xl font-bold text-yellow-300">
              {formatMoney(totals.unpaidCommission)}
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-[18px] border border-white/8 bg-black/20 p-3">
          <div className="mb-3 text-sm font-semibold text-white">Employee Overrides</div>

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
                    value={getOverrideDraft(employee.employeeName)}
                    onChange={(e) =>
                      setOverrideDraft(employee.employeeName, Number(e.target.value))
                    }
                    className="w-24 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    onClick={() =>
                      savePersonOverride(
                        employee.employeeName,
                        getOverrideDraft(employee.employeeName)
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
          <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
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
                  <th className="pb-2 font-medium">Avg Rate</th>
                  <th className="pb-2 font-medium">Commission</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Notes</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>

              <tbody>
                {commissionRows.map((row) => {
                  const key = rowKey(row.employeeName, weekStartKey);
                  const draft = drafts[key] ?? {
                    status: row.status,
                    notes: row.notes,
                  };
                  const matchingEmployee = weeklyEmployees.find(
                    (employee) => employee.employeeName === row.employeeName
                  );

                  return (
                    <tr key={row.employeeName} className="border-b border-white/5">
                      <td className="py-3 text-white">{row.employeeName}</td>
                      <td className="py-3 text-zinc-300">
                        {matchingEmployee?.role ?? "Employee"}
                      </td>
                      <td className="py-3 text-white">{row.salesCount}</td>
                      <td className="py-3 text-white">{formatMoney(row.salesTotal)}</td>
                      <td className="py-3 text-green-300">
                        {formatMoney(row.totalProfit)}
                      </td>
                      <td className="py-3 text-white">{row.commissionRate}%</td>
                      <td className="py-3 text-white">
                        {formatMoney(row.commissionEarned)}
                      </td>
                      <td className="py-3">
                        <select
                          value={draft.status}
                          onChange={async (e) => {
                            const nextStatus = e.target.value as CommissionStatus;
                            const key = rowKey(row.employeeName, weekStartKey);
                            const nextDraft = {
                              status: nextStatus,
                              notes: draft.notes,
                            };

                            setDrafts((prev) => ({
                              ...prev,
                              [key]: nextDraft,
                            }));

                            setSavingRowKey(key);

                            try {
                              await upsertCommissionPayoutInSupabase({
                                weekStart: weekStartKey,
                                employeeName: row.employeeName,
                                status: nextStatus,
                                notes: draft.notes,
                              });

                              const refreshed = await getCommissionPayoutsFromSupabase();
                              setPayouts(refreshed);
                              showMessage(`${row.employeeName} status updated.`);
                            } catch (error) {
                              console.error(error);
                              showMessage("Failed to save payout.");
                            } finally {
                              setSavingRowKey(null);
                            }
                          }}
                          className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none"
                        >
                          <option value="Unpaid">Unpaid</option>
                          <option value="Paid">Paid</option>
                        </select>
                      </td>
                      <td className="py-3">
                        <input
                          value={draft.notes}
                          onChange={(e) =>
                            updateRowDraft(row.employeeName, {
                              notes: e.target.value,
                            })
                          }
                          placeholder="Notes..."
                          className="w-full min-w-[160px] rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-zinc-500"
                        />
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => void saveRow(row.employeeName)}
                          disabled={savingRowKey === key}
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                        >
                          {savingRowKey === key ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
