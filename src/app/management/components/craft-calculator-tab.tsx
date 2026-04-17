"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CraftRecipeRecord,
  deleteCraftRecipeInSupabase,
  getCraftRecipesFromSupabase,
  upsertCraftRecipeInSupabase,
} from "@/lib/gunstore/craft-recipes";
import { CatalogProduct } from "@/lib/gunstore/types";

type CraftMaterialKey =
  | "titanium"
  | "scrap"
  | "steel"
  | "plastic"
  | "aluminum"
  | "rubber"
  | "electronics"
  | "glass"
  | "wite"
  | "gunpowder";

type CraftPlanRow = {
  id: string;
  itemName: string;
  craftCount: number;
};

type CraftRecipe = CraftRecipeRecord;

const ROWS_STORAGE_KEY = "gunstore_craft_calculator_rows";

const materialColumns: { key: CraftMaterialKey; label: string }[] = [
  { key: "titanium", label: "Titanium" },
  { key: "scrap", label: "Scrap" },
  { key: "steel", label: "Steel" },
  { key: "plastic", label: "Plastic" },
  { key: "aluminum", label: "Aluminum" },
  { key: "rubber", label: "Rubber" },
  { key: "electronics", label: "Electronics" },
  { key: "glass", label: "Glass" },
  { key: "wite", label: "Wite" },
  { key: "gunpowder", label: "Gunpowder" },
];

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function createEmptyRow(): CraftPlanRow {
  return {
    id: createId(),
    itemName: "",
    craftCount: 1,
  };
}

function createEmptyRecipe(itemName = ""): CraftRecipe {
  return {
    itemName,
    titanium: 0,
    scrap: 0,
    steel: 0,
    plastic: 0,
    aluminum: 0,
    rubber: 0,
    electronics: 0,
    glass: 0,
    wite: 0,
    gunpowder: 0,
  };
}

function sanitizeNumber(value: unknown, fallback = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(numericValue, 0);
}

function normalizeRow(row: Partial<CraftPlanRow>): CraftPlanRow {
  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id : createId(),
    itemName: typeof row.itemName === "string" ? row.itemName : "",
    craftCount: sanitizeNumber(row.craftCount, 1) || 1,
  };
}

type CraftCalculatorTabProps = {
  catalogProducts: CatalogProduct[];
};

export default function CraftCalculatorTab({
  catalogProducts,
}: CraftCalculatorTabProps) {
  const productNames = useMemo(() => {
    return [...new Set(catalogProducts.map((product) => product.name).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [catalogProducts]);

  const [rows, setRows] = useState<CraftPlanRow[]>(() => {
    if (typeof window === "undefined") {
      return [createEmptyRow()];
    }

    try {
      const raw = window.localStorage.getItem(ROWS_STORAGE_KEY);
      if (!raw) return [createEmptyRow()];

      const parsed = JSON.parse(raw) as Partial<CraftPlanRow>[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [createEmptyRow()];
      }

      return parsed.map(normalizeRow);
    } catch {
      return [createEmptyRow()];
    }
  });

  const [recipes, setRecipes] = useState<Record<string, CraftRecipe>>({});
  const [recipeEditorItem, setRecipeEditorItem] = useState("");
  const [recipeDraft, setRecipeDraft] = useState<CraftRecipe>(createEmptyRecipe());
  const [loadedRecipeName, setLoadedRecipeName] = useState("");
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ROWS_STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const loadRecipes = useCallback(async () => {
    setLoadingRecipes(true);

    try {
      const loadedRecipes = await getCraftRecipesFromSupabase();
      const nextRecipes = loadedRecipes.reduce(
        (acc, recipe) => {
          acc[recipe.itemName] = recipe;
          return acc;
        },
        {} as Record<string, CraftRecipe>
      );

      setRecipes(nextRecipes);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load craft item requirements.";
      setSaveMessage(
        `Failed to load shared craft item requirements. ${message}`
      );
    } finally {
      setLoadingRecipes(false);
    }
  }, []);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  const plannerOptions = useMemo(() => {
    return [...new Set([...productNames, ...Object.keys(recipes)].filter(Boolean))].sort(
      (a, b) => a.localeCompare(b)
    );
  }, [productNames, recipes]);

  const rowSummaries = useMemo(() => {
    return rows.map((row) => {
      const recipe = recipes[row.itemName] ?? createEmptyRecipe(row.itemName);
      const totals = materialColumns.reduce(
        (acc, column) => {
          acc[column.key] = recipe[column.key] * row.craftCount;
          return acc;
        },
        {} as Record<CraftMaterialKey, number>
      );

      return {
        ...row,
        recipe,
        totals,
        totalUnits: Object.values(totals).reduce((sum, value) => sum + value, 0),
        hasRecipe: Object.values(recipe)
          .filter((value) => typeof value === "number")
          .some((value) => Number(value) > 0),
      };
    });
  }, [rows, recipes]);

  const grandTotals = useMemo(() => {
    return materialColumns.reduce(
      (acc, column) => {
        acc[column.key] = rowSummaries.reduce(
          (sum, row) => sum + row.totals[column.key],
          0
        );
        return acc;
      },
      {} as Record<CraftMaterialKey, number>
    );
  }, [rowSummaries]);

  function showMessage(message: string) {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 2800);
  }

  function openRecipeEditor(itemName: string) {
    const trimmedName = itemName.trim();
    const recipe = recipes[trimmedName] ?? createEmptyRecipe(trimmedName);
    setRecipeEditorItem(trimmedName);
    setRecipeDraft(recipe);
    setLoadedRecipeName(trimmedName && recipes[trimmedName] ? trimmedName : "");
  }

  function updateRow(
    rowId: string,
    key: keyof CraftPlanRow,
    value: string | number
  ) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]:
                key === "itemName"
                  ? String(value)
                  : sanitizeNumber(value, key === "craftCount" ? 1 : 0),
            }
          : row
      )
    );
  }

  function addRow() {
    setRows((prev) => [...prev, createEmptyRow()]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => {
      if (prev.length === 1) {
        return [createEmptyRow()];
      }

      return prev.filter((row) => row.id !== rowId);
    });
  }

  function resetRows() {
    setRows([createEmptyRow()]);
  }

  function updateRecipeDraft(
    key: keyof CraftRecipe,
    value: string | number
  ) {
    if (key === "itemName") {
      const nextItemName = String(value);
      setRecipeEditorItem(nextItemName);
      setRecipeDraft((prev) => ({
        ...prev,
        itemName: nextItemName,
      }));
      return;
    }

    setRecipeDraft((prev) => ({
      ...prev,
      [key]: sanitizeNumber(value, 0),
    }));
  }

  async function handleSaveRecipe() {
    const trimmedName = recipeEditorItem.trim();

    if (!trimmedName) {
      showMessage("Please choose an item name before saving.");
      return;
    }

    setSavingRecipe(true);

    try {
      await upsertCraftRecipeInSupabase({
        ...recipeDraft,
        itemName: trimmedName,
      });

      if (loadedRecipeName && loadedRecipeName !== trimmedName) {
        await deleteCraftRecipeInSupabase(loadedRecipeName);
        setRows((prev) =>
          prev.map((row) =>
            row.itemName === loadedRecipeName
              ? { ...row, itemName: trimmedName }
              : row
          )
        );
      }

      await loadRecipes();
      setLoadedRecipeName(trimmedName);
      setRecipeDraft((prev) => ({ ...prev, itemName: trimmedName }));
      showMessage("Craft item requirement saved.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save craft item requirement.";
      showMessage(message);
    } finally {
      setSavingRecipe(false);
    }
  }

  async function handleDeleteRecipe() {
    const trimmedName = recipeEditorItem.trim();

    if (!trimmedName) {
      showMessage("Choose an item before deleting.");
      return;
    }

    setSavingRecipe(true);

    try {
      await deleteCraftRecipeInSupabase(trimmedName);
      await loadRecipes();
      setRows((prev) =>
        prev.map((row) =>
          row.itemName === trimmedName ? { ...row, itemName: "" } : row
        )
      );
      setRecipeEditorItem("");
      setRecipeDraft(createEmptyRecipe());
      setLoadedRecipeName("");
      showMessage("Craft item requirement deleted.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete craft item requirement.";
      showMessage(message);
    } finally {
      setSavingRecipe(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Craft Planner
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              Material Requirement Calculator
            </div>
            <div className="text-xs text-zinc-400">
              Pick an item, enter how many crafts you want, and the planner uses that
              item&apos;s shared Supabase recipe automatically.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {saveMessage && (
              <div className="text-xs text-green-300">{saveMessage}</div>
            )}

            <button
              onClick={addRow}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.2)] hover:bg-red-500"
            >
              Add Item
            </button>

            <button
              onClick={resetRows}
              className="rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Reset Table
            </button>
          </div>
        </div>

        {loadingRecipes ? (
          <div className="mt-4 rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
            Loading shared craft item requirements...
          </div>
        ) : (
          <div className="craft-table-scroll mt-4 overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-zinc-400">
                <tr className="border-b border-white/10">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 font-medium">Crafts Wanted</th>
                  {materialColumns.map((column) => (
                    <th key={column.key} className="pb-2 font-medium">
                      {column.label}
                    </th>
                  ))}
                  <th className="pb-2 font-medium">Total Units</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rowSummaries.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 align-top transition hover:bg-white/5"
                  >
                    <td className="py-3 pr-3">
                      <div className="space-y-2">
                        <select
                          value={row.itemName}
                          onChange={(e) => {
                            updateRow(row.id, "itemName", e.target.value);
                            openRecipeEditor(e.target.value);
                          }}
                          className="w-[220px] rounded-xl border border-white/8 bg-white px-3 py-2 text-sm text-black outline-none"
                        >
                          <option value="" className="bg-white text-black">
                            Select item
                          </option>
                          {plannerOptions.map((name) => (
                            <option
                              key={name}
                              value={name}
                              className="bg-white text-black"
                            >
                              {name}
                            </option>
                          ))}
                        </select>
                        <div
                          className={`text-xs ${
                            row.hasRecipe ? "text-green-300" : "text-yellow-300"
                          }`}
                        >
                          {row.hasRecipe ? "Recipe loaded" : "Recipe not set yet"}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        min="1"
                        value={row.craftCount}
                        onChange={(e) => updateRow(row.id, "craftCount", e.target.value)}
                        className="w-28 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                      />
                    </td>

                    {materialColumns.map((column) => (
                      <td key={column.key} className="py-3 pr-3">
                        <div className="space-y-2">
                          <div className="w-24 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white">
                            {row.recipe[column.key].toLocaleString()}
                          </div>
                          <div className="text-xs text-zinc-500">
                            Total: {row.totals[column.key].toLocaleString()}
                          </div>
                        </div>
                      </td>
                    ))}

                    <td className="py-3 pr-3 text-white">
                      {row.totalUnits.toLocaleString()}
                    </td>

                    <td className="py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => openRecipeEditor(row.itemName)}
                          className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white hover:bg-white/10"
                        >
                          Edit Recipe
                        </button>

                        <button
                          onClick={() => removeRow(row.id)}
                          className="rounded-md border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Total Materials
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            Combined Craft Totals
          </div>
          <div className="text-xs text-zinc-400">
            This is the total amount you need across every planned craft.
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {materialColumns.map((column) => (
            <div
              key={column.key}
              className="rounded-[18px] border border-white/8 bg-black/20 p-3"
            >
              <div className="text-xs text-zinc-400">{column.label}</div>
              <div className="mt-1 text-xl font-bold text-white">
                {grandTotals[column.key].toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="col-span-12 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)]">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Recipe Editor
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            Craft Item Requirments
          </div>
          <div className="text-xs text-zinc-400">
            Save the material requirement in Supabase once per item, then the
            planner will use it for everyone.
          </div>
        </div>

        <div className="mt-4 max-w-4xl space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Item Name</label>
            <input
              list="craft-recipe-names"
              value={recipeEditorItem}
              onChange={(e) => updateRecipeDraft("itemName", e.target.value)}
              onBlur={() => openRecipeEditor(recipeEditorItem)}
              placeholder="Choose or type item"
              className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />
            <datalist id="craft-recipe-names">
              {plannerOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {materialColumns.map((column) => (
              <div key={column.key}>
                <label className="mb-1 block text-xs text-zinc-400">
                  {column.label}
                </label>
                <input
                  type="number"
                  min="0"
                  value={recipeDraft[column.key]}
                  onChange={(e) =>
                    updateRecipeDraft(column.key, e.target.value)
                  }
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            ))}
          </div>

          <div className="rounded-[18px] border border-white/8 bg-black/20 p-3 text-xs text-zinc-400">
            <div>
              Current recipe total per craft:{" "}
              <span className="font-semibold text-white">
                {materialColumns
                  .reduce((sum, column) => sum + recipeDraft[column.key], 0)
                  .toLocaleString()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              onClick={handleSaveRecipe}
              disabled={savingRecipe}
              className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(220,38,38,0.2)] hover:bg-red-500 disabled:opacity-60"
            >
              {savingRecipe ? "Saving..." : "Save Recipe"}
            </button>

            <button
              onClick={handleDeleteRecipe}
              disabled={savingRecipe}
              className="w-full rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-60"
            >
              {savingRecipe ? "Working..." : "Delete Recipe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
