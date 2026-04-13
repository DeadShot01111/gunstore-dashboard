import { ammoBulkItems, defaultCatalogProducts } from "./catalog";
import { CatalogProduct, SavedOrder, SavedOrderItem } from "./types";

export function getCatalogPrice(
  product: CatalogProduct,
  qty: number,
  vipEnabled: boolean
) {
  if (vipEnabled) {
    if (product.vipMode === "fixed") {
      return product.vipFixedPrice ?? product.price;
    }

    if (product.vipMode === "percent") {
      const percent = product.vipPercent ?? 15;
      return Math.round(product.price * (1 - percent / 100));
    }

    return product.price;
  }

  if (
    product.category === "Ammo" &&
    ammoBulkItems.includes(product.name) &&
    qty >= 10
  ) {
    return Math.max(product.price - 50, 0);
  }

  return product.price;
}

export function recalcOrder(
  order: SavedOrder,
  catalogProducts: CatalogProduct[] = defaultCatalogProducts
): SavedOrder {
  const catalogMap = new Map(catalogProducts.map((item) => [item.name, item]));

  const items: SavedOrderItem[] = order.items.map((item) => {
    const product = catalogMap.get(item.name);

    if (!product) {
      const fallbackUnitProfit = item.unitPrice - (item.storeCost ?? 0);
      const fallbackLineProfit = fallbackUnitProfit * item.qty;
      const fallbackCommissionPercent = item.commissionPercent ?? 0;
      const fallbackLineCommission = Math.round(
        fallbackLineProfit * (fallbackCommissionPercent / 100)
      );

      return {
        ...item,
        lineTotal: item.unitPrice * item.qty,
        storeCost: item.storeCost ?? 0,
        unitProfit: fallbackUnitProfit,
        lineProfit: fallbackLineProfit,
        commissionPercent: fallbackCommissionPercent,
        lineCommission: fallbackLineCommission,
      };
    }

    const unitPrice = getCatalogPrice(product, item.qty, order.vipEnabled);
    const storeCost = product.cost;
    const unitProfit = unitPrice - storeCost;
    const lineProfit = unitProfit * item.qty;
    const commissionPercent = product.commissionPercent ?? 0;
    const lineCommission = Math.round(lineProfit * (commissionPercent / 100));

    return {
      ...item,
      category: product.category,
      unitPrice,
      lineTotal: unitPrice * item.qty,
      storeCost,
      unitProfit,
      lineProfit,
      commissionPercent,
      lineCommission,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = Number(order.discount) || 0;
  const total = subtotal - discount;

  const totalCost = items.reduce((sum, item) => sum + item.storeCost * item.qty, 0);
  const totalProfit = items.reduce((sum, item) => sum + item.lineProfit, 0);
  const totalCommission = items.reduce((sum, item) => sum + item.lineCommission, 0);

  return {
    ...order,
    items,
    subtotal,
    discount,
    total,
    totalCost,
    totalProfit,
    totalCommission,
  };
}