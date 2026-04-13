"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getStoredMaterialPurchases,
  MaterialPurchase,
  MaterialType,
  ReimbursementStatus,
  materialOptions,
  saveStoredMaterialPurchases,
} from "@/lib/gunstore/materials";
import { getWeekRange, isWithinWeek } from "@/lib/gunstore/week";

type MaterialPurchaseTabProps = {
  managerName?: string;
};

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

export default function MaterialPurchaseTab({
  managerName = "Management",
}: MaterialPurchaseTabProps) {
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  const [form, setForm] = useState({
    createdAt: new Date().toISOString(),
    material: "Recyclables" as MaterialType,
    quantity: 1,
    unitPrice: 0,
    purchasedBy: "",
    reimbursementStatus: "Unpaid" as ReimbursementStatus,
    notes: "",
  });

  useEffect(() => {
    setPurchases(getStoredMaterialPurchases());
  }, []);

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);

  const weekPurchases = useMemo(() => {
    return purchases
      .filter((purchase) => isWithinWeek(purchase.createdAt, weekAnchor))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [purchases, weekAnchor]);

  const weeklyTotal = useMemo(() => {
    return weekPurchases.reduce((sum, item) => sum + item.totalCost, 0);
  }, [weekPurchases]);

  const paidTotal = useMemo(() => {
    return weekPurchases
      .filter((item) => item.reimbursementStatus === "Paid")
      .reduce((sum, item) => sum + item.totalCost, 0);
  }, [weekPurchases]);

  const unpaidTotal = useMemo(() => {
    return weekPurchases
      .filter((item) => item.reimbursementStatus === "Unpaid")
      .reduce((sum, item) => sum + item.totalCost, 0);
  }, [weekPurchases]);

  function shiftWeek(direction: "prev" | "next") {
    setWeekAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + (direction === "prev" ? -7 : 7));
      return next;
    });
  }

  function resetForm() {
    setForm({
      createdAt: new Date().toISOString(),
      material: "Recyclables",
      quantity: 1,
      unitPrice: 0,
      purchasedBy: "",
      reimbursementStatus: "Unpaid",
      notes: "",
    });
    setEditingId(null);
  }

  function handleSavePurchase() {
    const quantity = Number(form.quantity);
    const unitPrice = Number(form.unitPrice);

    if (!form.material || quantity <= 0 || unitPrice < 0) {
      setSaveMessage("Please enter a valid material, quantity, and price.");
      setTimeout(() => setSaveMessage(""), 2200);
      return;
    }

    const purchase: MaterialPurchase = {
      id: editingId ?? crypto.randomUUID(),
      createdAt: new Date(form.createdAt).toISOString(),
      material: form.material,
      quantity,
      unitPrice,
      totalCost: quantity * unitPrice,
      purchasedBy: form.purchasedBy.trim(),
      reimbursementStatus: form.reimbursementStatus,
      notes: form.notes.trim(),
    };

    let updated: MaterialPurchase[];

    if (editingId) {
      updated = purchases.map((item) =>
        item.id === editingId ? purchase : item
      );
      setSaveMessage("Material purchase updated.");
    } else {
      updated = [purchase, ...purchases];
      setSaveMessage("Material purchase logged.");
    }

    setPurchases(updated);
    saveStoredMaterialPurchases(updated);
    resetForm();
    setTimeout(() => setSaveMessage(""), 2200);
  }

  function handleEditPurchase(purchase: MaterialPurchase) {
    setEditingId(purchase.id);
    setForm({
      createdAt: purchase.createdAt,
      material: purchase.material,
      quantity: purchase.quantity,
      unitPrice: purchase.unitPrice,
      purchasedBy: purchase.purchasedBy ?? "",
      reimbursementStatus: purchase.reimbursementStatus ?? "Unpaid",
      notes: purchase.notes ?? "",
    });
  }

  function handleDeletePurchase(id: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this material purchase log?"
    );

    if (!confirmed) return;

    const updated = purchases.filter((item) => item.id !== id);
    setPurchases(updated);
    saveStoredMaterialPurchases(updated);

    if (editingId === id) {
      resetForm();
    }

    setSaveMessage("Material purchase deleted.");
    setTimeout(() => setSaveMessage(""), 2200);
  }

  const liveTotal = Number(form.quantity || 0) * Number(form.unitPrice || 0);

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Material Purchase Form
            </div>
            <div className="text-xs text-zinc-400">
              Log store material costs for weekly tracking.
            </div>
          </div>

          {saveMessage && (
            <div className="text-xs text-green-300">{saveMessage}</div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Date / Time</label>
            <input
              type="datetime-local"
              value={toDateTimeLocalValue(form.createdAt)}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  createdAt: new Date(e.target.value).toISOString(),
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Material</label>
            <select
              value={form.material}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  material: e.target.value as MaterialType,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            >
              {materialOptions.map((material) => (
                <option key={material} value={material}>
                  {material}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Quantity</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    quantity: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Price Per Unit
              </label>
              <input
                type="number"
                min="0"
                value={form.unitPrice}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    unitPrice: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Purchased By</label>
            <input
              value={form.purchasedBy}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  purchasedBy: e.target.value,
                }))
              }
              placeholder="Employee name"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Reimbursed</label>
            <select
              value={form.reimbursementStatus}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  reimbursementStatus: e.target.value as ReimbursementStatus,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Notes</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Live Total</span>
              <span className="font-semibold text-white">
                {formatMoney(liveTotal)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSavePurchase}
              className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
            >
              {editingId ? "Save Changes" : "Log Purchase"}
            </button>

            <button
              onClick={resetForm}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Clear Form
            </button>
          </div>
        </div>
      </div>

      <div className="col-span-12 rounded-xl border border-white/10 bg-black/20 p-4 xl:col-span-8">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Weekly Material Purchases
            </div>
            <div className="text-xs text-zinc-400">
              These costs will later feed into weekly business performance.
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
            <div className="text-xs text-zinc-400">Weekly Purchase Total</div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatMoney(weeklyTotal)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Entries This Week</div>
            <div className="mt-1 text-xl font-bold text-white">
              {weekPurchases.length}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Paid Back</div>
            <div className="mt-1 text-xl font-bold text-green-300">
              {formatMoney(paidTotal)}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Still Owed</div>
            <div className="mt-1 text-xl font-bold text-yellow-300">
              {formatMoney(unpaidTotal)}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-white/10">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Material</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Unit Price</th>
                <th className="pb-2 font-medium">Total</th>
                <th className="pb-2 font-medium">Purchased By</th>
                <th className="pb-2 font-medium">Reimbursed</th>
                <th className="pb-2 font-medium">Notes</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {weekPurchases.map((purchase) => (
                <tr
                  key={purchase.id}
                  className="border-b border-white/5 transition hover:bg-white/5"
                >
                  <td className="py-3 text-white">
                    {formatDateTime(purchase.createdAt)}
                  </td>
                  <td className="py-3 text-white">{purchase.material}</td>
                  <td className="py-3 text-white">{purchase.quantity}</td>
                  <td className="py-3 text-white">
                    {formatMoney(purchase.unitPrice)}
                  </td>
                  <td className="py-3 text-white">
                    {formatMoney(purchase.totalCost)}
                  </td>
                  <td className="py-3 text-zinc-300">
                    {purchase.purchasedBy?.trim() ? purchase.purchasedBy : "-"}
                  </td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        purchase.reimbursementStatus === "Paid"
                          ? "bg-green-500/15 text-green-300 border border-green-400/20"
                          : "bg-yellow-500/15 text-yellow-300 border border-yellow-400/20"
                      }`}
                    >
                      {purchase.reimbursementStatus}
                    </span>
                  </td>
                  <td className="py-3 text-zinc-300">
                    {purchase.notes?.trim() ? purchase.notes : "-"}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditPurchase(purchase)}
                        className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white hover:bg-white/10"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDeletePurchase(purchase.id)}
                        className="rounded-md border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {weekPurchases.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-400">
              No material purchases found for this week.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}