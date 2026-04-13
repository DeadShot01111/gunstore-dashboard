"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredOrders } from "@/lib/gunstore/orders";
import { SavedOrder } from "@/lib/gunstore/types";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";
import {
  CommissionPayoutRecord,
  CommissionStatus,
  getStoredCommissionPayouts,
  getStoredDefaultCommissionRate,
  saveStoredCommissionPayouts,
  saveStoredDefaultCommissionRate,
} from "@/lib/gunstore/commissions";

function formatMoney(value: number) {
  return `$${value.toLocaleString()}`;
}

function getWeekStartKey(anchor: Date) {
  const { start } = getWeekRange(anchor);
  return start.toISOString();
}

type EmployeeCommissionRow = {
  employeeName: string;
  salesCount: number;
  salesTotal: number;
  commissionRate: number;
  commissionEarned: number;
  status: CommissionStatus;
  notes: string;
};

export default function CommissionsTab() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayoutRecord[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [defaultRate, setDefaultRate] = useState(5);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setOrders(getStoredOrders());
    setPayouts(getStoredCommissionPayouts());
    setDefaultRate(getStoredDefaultCommissionRate());
  }, []);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const weekStartKey = useMemo(() => getWeekStartKey(weekAnchor), [weekAnchor]);

  const weekOrders = useMemo(() => {
    return orders.filter((order) => isWithinWeek(order.createdAt, weekAnchor));
  }, [orders, weekAnchor]);

  const commissionRows = useMemo(() => {
    const grouped = new Map<string, { salesCount: number; salesTotal: number }>();

    for (const order of weekOrders) {
      const current = grouped.get(order.employeeName) ?? {
        salesCount: 0,
        salesTotal: 0,
      };

      grouped.set(order.employeeName, {
        salesCount: current.salesCount + 1,
        salesTotal: current.salesTotal + order.total,
      });
    }

    const rows: EmployeeCommissionRow[] = Array.from(grouped.entries())
      .map(([employeeName, values]) => {
        const savedPayout = payouts.find(
          (payout) =>
            payout.employeeName === employeeName &&
            payout.weekStart === weekStartKey
        );

        const commissionRate = savedPayout?.commissionRate ?? defaultRate;
        const commissionEarned = Math.round(
          values.salesTotal * (commissionRate / 100)
        );

        return {
          employeeName,
          salesCount: values.salesCount,
          salesTotal: values.salesTotal,
          commissionRate,
          commissionEarned,
          status: savedPayout?.status ?? "Unpaid",
          notes: savedPayout?.notes ?? "",
        };
      })
      .sort((a, b) => b.salesTotal - a.salesTotal);

    return rows;
  }, [weekOrders, payouts, weekStartKey, defaultRate]);

  const totals = useMemo(() => {
    const totalSales = commissionRows.reduce((sum, row) => sum + row.salesTotal, 0);
    const totalCommission = commissionRows.reduce(
      (sum, row) => sum + row.commissionEarned,
      0
    );
    const paidCommission = commissionRows
      .filter((row) => row.status === "Paid")
      .reduce((sum, row) => sum + row.commissionEarned, 0);
    const unpaidCommission = commissionRows
      .filter((row) => row.status === "Unpaid")
      .reduce((sum, row) => sum + row.commissionEarned, 0);

    return {
      totalSales,
      totalCommission,
      paidCommission,
      unpaidCommission,
    };
  }, [commissionRows]);

  function shiftWeek(direction: "prev" | "next") {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (direction === "prev" ? -7 : 7));
      return next;
    });
  }

  function showMessage(message: string) {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 2200);
  }

  function handleSaveDefaultRate() {
    saveStoredDefaultCommissionRate(defaultRate);
    showMessage("Default commission rate saved.");
  }

  function upsertPayout(
    employeeName: string,
    updates: Partial<CommissionPayoutRecord>
  ) {
    const existing = payouts.find(
      (payout) =>
        payout.employeeName === employeeName && payout.weekStart === weekStartKey
    );

    const base: CommissionPayoutRecord = existing ?? {
      id: crypto.randomUUID(),
      weekStart: weekStartKey,
      employeeName,
      commissionRate: defaultRate,
      status: "Unpaid",
      notes: "",
    };

    const updated: CommissionPayoutRecord = {
      ...base,
      ...updates,
    };

    const filtered = payouts.filter(
      (payout) =>
        !(
          payout.employeeName === employeeName &&
          payout.weekStart === weekStartKey
        )
    );

    const next = [updated, ...filtered];
    setPayouts(next);
    saveStoredCommissionPayouts(next);
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-3">
        <div className="mb-4">
          <div className="text-sm font-semibold text-white">Commission Settings</div>
          <div className="text-xs text-zinc-400">
            Set the default weekly commission rate.
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Default Commission Rate (%)
            </label>
            <input
              type="number"
              min="0"
              value={defaultRate}
              onChange={(e) => setDefaultRate(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <button
            onClick={handleSaveDefaultRate}
            className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            Save Default Rate
          </button>

          {saveMessage && (
            <div className="rounded-lg border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
              {saveMessage}
            </div>
          )}
        </div>
      </div>

      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-9">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Weekly Commissions
            </div>
            <div className="text-xs text-zinc-400">
              Commissions are based on weekly sales logs.
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
              {weekRange.start.toLocaleDateString()} -{" "}
              {weekRange.end.toLocaleDateString()}
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
            <div className="text-xs text-zinc-400">Weekly Sales</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(totals.totalSales)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Total Commission</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(totals.totalCommission)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Paid Out</div>
            <div className="mt-1 text-xl font-bold text-green-300">
              {formatMoney(totals.paidCommission)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Still Owed</div>
            <div className="mt-1 text-xl font-bold text-yellow-300">
              {formatMoney(totals.unpaidCommission)}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-white/10">
                <th className="pb-2 font-medium">Employee</th>
                <th className="pb-2 font-medium">Sales</th>
                <th className="pb-2 font-medium">Sales Total</th>
                <th className="pb-2 font-medium">Rate</th>
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
                  <td className="py-3 text-white">{formatMoney(row.salesTotal)}</td>
                  <td className="py-3">
                    <input
                      type="number"
                      min="0"
                      value={row.commissionRate}
                      onChange={(e) =>
                        upsertPayout(row.employeeName, {
                          commissionRate: Number(e.target.value),
                        })
                      }
                      className="w-20 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white outline-none"
                    />
                  </td>
                  <td className="py-3 text-white">
                    {formatMoney(
                      Math.round(row.salesTotal * (row.commissionRate / 100))
                    )}
                  </td>
                  <td className="py-3">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        upsertPayout(row.employeeName, {
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
                        upsertPayout(row.employeeName, {
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
              No commission records found for this week.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}