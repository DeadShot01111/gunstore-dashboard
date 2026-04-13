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
    return product.price - 50;
  }

  return product.price;
}

export function recalcOrder(
  order: SavedOrder,
  catalogProducts: CatalogProduct[] = defaultCatalogProducts
): SavedOrder {
  const catalogMap = new Map(
    catalogProducts.map((item) => [item.name, item])
  );

  const items: SavedOrderItem[] = order.items.map((item) => {
    const product = catalogMap.get(item.name);

    if (!product) {
      return {
        ...item,
        lineTotal: item.unitPrice * item.qty,
      };
    }

    const unitPrice = getCatalogPrice(product, item.qty, order.vipEnabled);

    return {
      ...item,
      category: product.category,
      unitPrice,
      lineTotal: unitPrice * item.qty,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = Number(order.discount) || 0;
  const total = subtotal - discount;

  return {
    ...order,
    items,
    subtotal,
    discount,
    total,
  };
}