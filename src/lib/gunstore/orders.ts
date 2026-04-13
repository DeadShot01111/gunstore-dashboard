import { SavedOrder } from "./types";

const STORAGE_KEY = "gunstore_orders";

export function getStoredOrders(): SavedOrder[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as SavedOrder[];

    return parsed.map((order) => ({
      ...order,
      status: order.status ?? "Completed",
      notes: order.notes ?? "",
      items: Array.isArray(order.items) ? order.items : [],
    }));
  } catch {
    return [];
  }
}

export function saveStoredOrders(orders: SavedOrder[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}