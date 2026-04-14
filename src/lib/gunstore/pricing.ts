import { CatalogProduct, SavedOrder, SavedOrderItem } from "./types";

type DiscountMode = "informational" | "applied";

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
    if (product.category === "Ammo" && ammoBulkItems.includes(product.name) && qty >= 20) {
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
    const unitCost = getNumber(item.unitCost);
    const unitProfit = unitPrice - unitCost;
    const totalProfit = unitProfit * qty;
    const commissionPercent = getNumber(item.commissionPercent);
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
  const commissionPercent = getNumber(item.commissionPercent);
  const commissionEarned = Math.round(totalProfit * (commissionPercent / 100));

  return {
    ...item,
    productId: product.id ?? item.productId ?? null,
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
  products: CatalogProduct[],
  options?: {
    discountMode?: DiscountMode;
  }
): SavedOrder {
  const productMap = getProductMap(products);
  const baseItems = (order.items ?? []).map((item) =>
    recalcItem(item, productMap, Boolean(order.vipEnabled))
  );

  const subtotal = baseItems.reduce(
    (sum, item) => sum + getNumber(item.lineTotal),
    0
  );

  const discountMode = options?.discountMode ?? "informational";
  const discount = getNumber(order.discount);
  const appliedDiscount =
    discountMode === "applied" ? Math.min(discount, subtotal) : 0;
  const total = Math.max(subtotal - appliedDiscount, 0);

  let remainingDiscount = appliedDiscount;
  const items = baseItems.map((item, index) => {
    const lineTotal = getNumber(item.lineTotal);
    const qty = Math.max(1, getNumber(item.qty, 1));
    const unitCost = getNumber(item.unitCost);
    const lineCost = unitCost * qty;

    const itemDiscount =
      index === baseItems.length - 1
        ? remainingDiscount
        : subtotal > 0
        ? (lineTotal / subtotal) * appliedDiscount
        : 0;

    remainingDiscount = Math.max(remainingDiscount - itemDiscount, 0);

    const adjustedRevenue = Math.max(lineTotal - itemDiscount, 0);
    const totalProfit = Math.max(adjustedRevenue - lineCost, 0);
    const unitProfit = qty > 0 ? totalProfit / qty : 0;
    const commissionPercent = getNumber(item.commissionPercent);
    const commissionEarned = Math.round(totalProfit * (commissionPercent / 100));

    return {
      ...item,
      unitProfit,
      totalProfit,
      commissionEarned,
    };
  });

  const totalProfit = items.reduce(
    (sum, item) => sum + getNumber(item.totalProfit),
    0
  );

  const totalCommission = items.reduce(
    (sum, item) => sum + getNumber(item.commissionEarned),
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
