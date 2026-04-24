import {
  AmmoPromotion,
  getApplicableAmmoPromotion,
  isAmmoPromotionEligibleProduct,
} from "./promotions";
import {
  CatalogProduct,
  PricingRule,
  SavedOrder,
  SavedOrderItem,
} from "./types";

type DiscountMode = "informational" | "applied";

export type PricingContext = {
  vipEnabled?: boolean;
  at?: string | Date;
  ammoPromotions?: AmmoPromotion[];
};

export type CatalogPricingDetails = {
  unitPrice: number;
  pricingRule: PricingRule;
  promotionId?: string | null;
  promotionName?: string;
  promotionDiscountPercent?: number;
};

export const AMMO_BULK_DISCOUNT_MIN_QTY = 20;
export const AMMO_BULK_DISCOUNT_PER_UNIT = 50;

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

export function isBulkDiscountAmmo(
  product: Pick<CatalogProduct, "category" | "name">
) {
  return (
    isAmmoPromotionEligibleProduct(product) &&
    product.name.trim().toLowerCase() !== "hunting ammo"
  );
}

export function hasAmmoBulkDiscount(
  product: Pick<CatalogProduct, "category" | "name">,
  qty: number,
  vipEnabled = false
) {
  return (
    !vipEnabled &&
    isBulkDiscountAmmo(product) &&
    qty >= AMMO_BULK_DISCOUNT_MIN_QTY
  );
}

export function getBulkDiscountLabel(
  product: Pick<CatalogProduct, "category" | "name">
) {
  if (!isBulkDiscountAmmo(product)) return null;
  return `${AMMO_BULK_DISCOUNT_MIN_QTY}+ units: $${AMMO_BULK_DISCOUNT_PER_UNIT} off each`;
}

export function getCatalogPricingDetails(
  product: CatalogProduct,
  qty = 1,
  context: PricingContext = {}
): CatalogPricingDetails {
  const vipEnabled = Boolean(context.vipEnabled);
  const at = context.at ?? new Date();
  const ammoPromotions = context.ammoPromotions ?? [];
  const normalPrice = getNumber(product.price);
  const activeAmmoPromotion = getApplicableAmmoPromotion(
    product,
    ammoPromotions,
    at
  );

  if (activeAmmoPromotion) {
    return {
      unitPrice: Math.max(
        Math.round(normalPrice * (1 - activeAmmoPromotion.discountPercent / 100)),
        0
      ),
      pricingRule: "ammo_promotion",
      promotionId: activeAmmoPromotion.id,
      promotionName: activeAmmoPromotion.name,
      promotionDiscountPercent: Number(activeAmmoPromotion.discountPercent ?? 0),
    };
  }

  if (hasAmmoBulkDiscount(product, qty, vipEnabled)) {
    return {
      unitPrice: Math.max(normalPrice - AMMO_BULK_DISCOUNT_PER_UNIT, 0),
      pricingRule: "bulk_ammo",
    };
  }

  if (!vipEnabled) {
    return {
      unitPrice: normalPrice,
      pricingRule: "standard",
    };
  }

  if (product.vipMode === "fixed") {
    return {
      unitPrice: getNumber(product.vipFixedPrice, normalPrice),
      pricingRule: "vip",
    };
  }

  if (product.vipMode === "percent") {
    const vipPercent = getNumber(product.vipPercent, 15);
    return {
      unitPrice: Math.max(Math.round(normalPrice * (1 - vipPercent / 100)), 0),
      pricingRule: "vip",
    };
  }

  return {
    unitPrice: normalPrice,
    pricingRule: "standard",
  };
}

export function getCatalogPrice(
  product: CatalogProduct,
  qty = 1,
  context: PricingContext = {}
) {
  return getCatalogPricingDetails(product, qty, context).unitPrice;
}

function recalcItem(
  item: SavedOrderItem,
  productMap: Map<string, CatalogProduct>,
  context: PricingContext
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
      pricingRule: item.pricingRule ?? "standard",
      promotionId: item.promotionId ?? null,
      promotionName: item.promotionName,
      promotionDiscountPercent: item.promotionDiscountPercent,
      unitCost,
      unitProfit,
      totalProfit,
      commissionPercent,
      commissionEarned,
    } as SavedOrderItem;
  }

  const pricing = getCatalogPricingDetails(product, qty, context);
  const unitPrice = pricing.unitPrice;
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
    pricingRule: pricing.pricingRule,
    promotionId: pricing.promotionId ?? null,
    promotionName: pricing.promotionName,
    promotionDiscountPercent: pricing.promotionDiscountPercent,
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
    ammoPromotions?: AmmoPromotion[];
  }
): SavedOrder {
  const productMap = getProductMap(products);
  const pricingContext: PricingContext = {
    vipEnabled: Boolean(order.vipEnabled),
    at: order.createdAt,
    ammoPromotions: options?.ammoPromotions ?? [],
  };
  const baseItems = (order.items ?? []).map((item) =>
    recalcItem(item, productMap, pricingContext)
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
