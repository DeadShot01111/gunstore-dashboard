import { supabase } from "@/lib/supabase/client";
import { SavedOrder, SavedOrderItem } from "./types";

type DbOrderRow = {
  id: string;
  employee_discord_id: string | null;
  employee_name: string;
  employee_email: string | null;
  role: string | null;
  vip_enabled: boolean;
  subtotal: number;
  discount: number;
  total: number;
  total_profit: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DbOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  category: string;
  qty: number;
  unit_price: number;
  line_total: number;
  unit_cost: number;
  unit_profit: number;
  total_profit: number;
  commission_percent: number;
  commission_earned: number;
  created_at: string;
};

function toSavedOrderItem(row: DbOrderItemRow): SavedOrderItem {
  return {
    name: row.product_name,
    category: row.category,
    qty: Number(row.qty ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    lineTotal: Number(row.line_total ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    unitProfit: Number(row.unit_profit ?? 0),
    totalProfit: Number(row.total_profit ?? 0),
    commissionPercent: Number(row.commission_percent ?? 0),
    commissionEarned: Number(row.commission_earned ?? 0),
  } as SavedOrderItem;
}

function toSavedOrder(row: DbOrderRow, items: SavedOrderItem[]): SavedOrder {
  const totalCommission = items.reduce(
    (sum, item) => sum + Number((item as any).commissionEarned ?? 0),
    0
  );

  return {
    id: row.id,
    createdAt: row.created_at,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email ?? undefined,
    role: row.role ?? undefined,
    vipEnabled: row.vip_enabled,
    items,
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    total: Number(row.total ?? 0),
    totalProfit: Number(row.total_profit ?? 0),
    totalCommission,
    status: (row.status as SavedOrder["status"]) ?? "Completed",
    notes: row.notes ?? "",
  } as SavedOrder;
}

export async function getOrdersFromSupabase(): Promise<SavedOrder[]> {
  const { data: orderRows, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (orderError) {
    throw new Error(orderError.message);
  }

  const orders = (orderRows ?? []) as DbOrderRow[];
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);

  const { data: itemRows, error: itemError } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  const itemsByOrderId = new Map<string, SavedOrderItem[]>();

  for (const item of ((itemRows ?? []) as DbOrderItemRow[])) {
    const existing = itemsByOrderId.get(item.order_id) ?? [];
    existing.push(toSavedOrderItem(item));
    itemsByOrderId.set(item.order_id, existing);
  }

  return orders.map((order) =>
    toSavedOrder(order, itemsByOrderId.get(order.id) ?? [])
  );
}

export async function createOrderInSupabase(params: {
  employeeDiscordId?: string | null;
  employeeName: string;
  employeeEmail?: string | null;
  role?: string | null;
  vipEnabled: boolean;
  subtotal: number;
  discount: number;
  total: number;
  totalProfit: number;
  status?: string;
  notes?: string | null;
  items: Array<{
    productId?: string | null;
    name: string;
    category: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    unitCost?: number;
    unitProfit?: number;
    totalProfit?: number;
    commissionPercent?: number;
    commissionEarned?: number;
  }>;
}) {
  const {
    employeeDiscordId = null,
    employeeName,
    employeeEmail = null,
    role = null,
    vipEnabled,
    subtotal,
    discount,
    total,
    totalProfit,
    status = "Completed",
    notes = "",
    items,
  } = params;

  const { data: insertedOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      employee_discord_id: employeeDiscordId,
      employee_name: employeeName,
      employee_email: employeeEmail,
      role,
      vip_enabled: vipEnabled,
      subtotal,
      discount,
      total,
      total_profit: totalProfit,
      status,
      notes,
    })
    .select("*")
    .single();

  if (orderError || !insertedOrder) {
    throw new Error(orderError?.message ?? "Failed to create order.");
  }

  const orderId = insertedOrder.id as string;

  const itemPayload = items.map((item) => ({
    order_id: orderId,
    product_id: item.productId ?? null,
    product_name: item.name,
    category: item.category,
    qty: Number(item.qty ?? 0),
    unit_price: Number(item.unitPrice ?? 0),
    line_total: Number(item.lineTotal ?? 0),
    unit_cost: Number(item.unitCost ?? 0),
    unit_profit: Number(item.unitProfit ?? 0),
    total_profit: Number(item.totalProfit ?? 0),
    commission_percent: Number(item.commissionPercent ?? 0),
    commission_earned: Number(item.commissionEarned ?? 0),
  }));

  const { error: itemError } = await supabase.from("order_items").insert(itemPayload);

  if (itemError) {
    throw new Error(itemError.message);
  }

  return orderId;
}

export async function updateOrderInSupabase(order: SavedOrder) {
  const { error } = await supabase
    .from("orders")
    .update({
      employee_name: order.employeeName,
      employee_email: order.employeeEmail ?? null,
      role: order.role ?? null,
      vip_enabled: order.vipEnabled,
      subtotal: Number(order.subtotal ?? 0),
      discount: Number(order.discount ?? 0),
      total: Number(order.total ?? 0),
      total_profit: Number((order as any).totalProfit ?? 0),
      status: order.status ?? "Completed",
      notes: order.notes ?? "",
    })
    .eq("id", order.id);

  if (error) {
    throw new Error(error.message);
  }

  const { error: deleteItemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", order.id);

  if (deleteItemsError) {
    throw new Error(deleteItemsError.message);
  }

  const itemPayload = order.items.map((item) => ({
    order_id: order.id,
    product_id: null,
    product_name: item.name,
    category: item.category,
    qty: Number(item.qty ?? 0),
    unit_price: Number(item.unitPrice ?? 0),
    line_total: Number(item.lineTotal ?? 0),
    unit_cost: Number((item as any).unitCost ?? 0),
    unit_profit: Number((item as any).unitProfit ?? 0),
    total_profit: Number((item as any).totalProfit ?? 0),
    commission_percent: Number((item as any).commissionPercent ?? 0),
    commission_earned: Number((item as any).commissionEarned ?? 0),
  }));

  if (itemPayload.length > 0) {
    const { error: insertItemsError } = await supabase
      .from("order_items")
      .insert(itemPayload);

    if (insertItemsError) {
      throw new Error(insertItemsError.message);
    }
  }
}

export async function deleteOrderInSupabase(orderId: string) {
  const { error } = await supabase.from("orders").delete().eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }
}