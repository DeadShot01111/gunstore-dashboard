import { CatalogProduct, SavedOrder, SavedOrderItem } from "./types";

function getNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getProductMap(products: CatalogProduct[]) {
  const map = new Map<string, CatalogProduct>();
  for (const product of products) {
    map.set(product.name, product);
  }
  return map;
}

export function getCatalogPrice(
  product: CatalogProduct,
  qty = 1,
  vipEnabled = false
) {
  const normalPrice = getNumber(product.price);

  if (!vipEnabled) {
    const ammoBulkItems = ["Pistol Ammo", "SMG Ammo", "Shotgun Ammo"];
    if (product.category === "Ammo" && ammoBulkItems.includes(product.name) && qty >= 10) {
      return Math.max(normalPrice - 50, 0);
    }
    return normalPrice;
  }

  if (product.vipMode === "fixed") {
    return getNumber(product.vipFixedPrice, normalPrice);
  }

  if (product.vipMode === "percent") {
    const vipPercent = getNumber(product.vipPercent, 15);
    return Math.max(Math.round(normalPrice * (1 - vipPercent / 100)), 0);
  }

  return normalPrice;
}

function recalcItem(
  item: SavedOrderItem,
  productMap: Map<string, CatalogProduct>,
  vipEnabled: boolean
): SavedOrderItem {
  const qty = Math.max(1, getNumber(item.qty, 1));
  const product = productMap.get(item.name);

  if (!product) {
    const unitPrice = getNumber(item.unitPrice);
    const lineTotal = unitPrice * qty;
    const unitCost = getNumber((item as any).unitCost);
    const unitProfit = unitPrice - unitCost;
    const totalProfit = unitProfit * qty;
    const commissionPercent = getNumber((item as any).commissionPercent);
    const commissionEarned = Math.round(totalProfit * (commissionPercent / 100));

    return {
      ...item,
      qty,
      unitPrice,
      lineTotal,
      unitCost,
      unitProfit,
      totalProfit,
      commissionPercent,
      commissionEarned,
    } as SavedOrderItem;
  }

  const unitPrice = getCatalogPrice(product, qty, vipEnabled);
  const lineTotal = unitPrice * qty;
  const unitCost = getNumber(product.cost);
  const unitProfit = unitPrice - unitCost;
  const totalProfit = unitProfit * qty;
  const commissionPercent = getNumber((item as any).commissionPercent);
  const commissionEarned = Math.round(totalProfit * (commissionPercent / 100));

  return {
    ...item,
    name: product.name,
    category: product.category,
    qty,
    unitPrice,
    lineTotal,
    unitCost,
    unitProfit,
    totalProfit,
    commissionPercent,
    commissionEarned,
  } as SavedOrderItem;
}

export function recalcOrder(
  order: SavedOrder,
  products: CatalogProduct[]
): SavedOrder {
  const productMap = getProductMap(products);
  const items = (order.items ?? []).map((item) =>
    recalcItem(item, productMap, Boolean(order.vipEnabled))
  );

  const subtotal = items.reduce(
    (sum, item) => sum + getNumber(item.lineTotal),
    0
  );

  const discount = getNumber(order.discount);
  const total = Math.max(subtotal - discount, 0);

  const totalProfit = items.reduce(
    (sum, item) => sum + getNumber((item as any).totalProfit),
    0
  );

  const totalCommission = items.reduce(
    (sum, item) => sum + getNumber((item as any).commissionEarned),
    0
  );

  return {
    ...order,
    items,
    subtotal,
    discount,
    total,
    totalProfit,
    totalCommission,
  } as SavedOrder;
}