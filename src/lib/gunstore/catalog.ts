import { CatalogProduct } from "./types";

export const categories = ["All", "Ammo", "Weapons", "Attachments", "Misc Items"];

export const defaultCatalogProducts: CatalogProduct[] = [
  {
    name: "Pistol Ammo",
    price: 350,
    category: "Ammo",
    vipMode: "fixed",
    vipFixedPrice: 250,
    cost: 100,
  },
  {
    name: "SMG Ammo",
    price: 700,
    category: "Ammo",
    vipMode: "fixed",
    vipFixedPrice: 550,
    cost: 250,
  },
  {
    name: "Shotgun Ammo",
    price: 500,
    category: "Ammo",
    vipMode: "fixed",
    vipFixedPrice: 400,
    cost: 180,
  },
  {
    name: "Hunting Ammo",
    price: 50,
    category: "Ammo",
    vipMode: "none",
    cost: 15,
  },

  {
    name: "Colt",
    price: 15000,
    category: "Weapons",
    vipMode: "percent",
    vipPercent: 15,
    cost: 9000,
  },
  {
    name: "Browning",
    price: 17000,
    category: "Weapons",
    vipMode: "percent",
    vipPercent: 15,
    cost: 10000,
  },
  {
    name: "Heavy Pistol",
    price: 20000,
    category: "Weapons",
    vipMode: "percent",
    vipPercent: 15,
    cost: 12000,
  },
  {
    name: "Shotgun",
    price: 25000,
    category: "Weapons",
    vipMode: "fixed",
    vipFixedPrice: 21000,
    cost: 16000,
  },
  {
    name: "Combat Shotgun",
    price: 30000,
    category: "Weapons",
    vipMode: "percent",
    vipPercent: 15,
    cost: 20000,
  },

  {
    name: "Small Scope",
    price: 4000,
    category: "Attachments",
    vipMode: "percent",
    vipPercent: 15,
    cost: 1800,
  },
  {
    name: "Medium Scope",
    price: 6000,
    category: "Attachments",
    vipMode: "percent",
    vipPercent: 15,
    cost: 2800,
  },
  {
    name: "Large Scope",
    price: 8000,
    category: "Attachments",
    vipMode: "percent",
    vipPercent: 15,
    cost: 4200,
  },

  {
    name: "Gun Bag",
    price: 12000,
    category: "Misc Items",
    vipMode: "percent",
    vipPercent: 15,
    cost: 7000,
  },
  {
    name: "Adv Lockpick",
    price: 12000,
    category: "Misc Items",
    vipMode: "none",
    cost: 5000,
  },
  {
    name: "Heavy Cutters",
    price: 1500,
    category: "Misc Items",
    vipMode: "none",
    cost: 600,
  },
];

const STORAGE_KEY = "gunstore_catalog";

function normalizeProduct(product: Partial<CatalogProduct>): CatalogProduct {
  return {
    id: product.id,
    name: product.name ?? "",
    category: product.category ?? "Misc Items",
    price: Number(product.price ?? 0),
    vipMode: product.vipMode ?? "none",
    vipPercent:
      product.vipMode === "percent"
        ? Number(product.vipPercent ?? 15)
        : product.vipPercent !== undefined
        ? Number(product.vipPercent)
        : undefined,
    vipFixedPrice:
      product.vipMode === "fixed"
        ? Number(product.vipFixedPrice ?? 0)
        : product.vipFixedPrice !== undefined
        ? Number(product.vipFixedPrice)
        : undefined,
    cost: Number(product.cost ?? 0),
  } as CatalogProduct;
}

export function getStoredCatalogProducts(): CatalogProduct[] {
  if (typeof window === "undefined") return defaultCatalogProducts;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCatalogProducts;

    const parsed = JSON.parse(raw) as Partial<CatalogProduct>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return defaultCatalogProducts;
    }

    return parsed.map(normalizeProduct);
  } catch {
    return defaultCatalogProducts;
  }
}

export function saveStoredCatalogProducts(products: CatalogProduct[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}
