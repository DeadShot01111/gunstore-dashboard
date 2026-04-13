import { CatalogProduct } from "./types";

export const categories = ["All", "Ammo", "Weapons", "Attachments", "Misc Items"];

export const defaultCatalogProducts: CatalogProduct[] = [
  { name: "Pistol Ammo", price: 350, category: "Ammo", vipMode: "fixed", vipFixedPrice: 250 },
  { name: "SMG Ammo", price: 700, category: "Ammo", vipMode: "fixed", vipFixedPrice: 550 },
  { name: "Shotgun Ammo", price: 500, category: "Ammo", vipMode: "fixed", vipFixedPrice: 400 },
  { name: "Hunting Ammo", price: 50, category: "Ammo", vipMode: "none" },

  { name: "Colt", price: 15000, category: "Weapons", vipMode: "percent", vipPercent: 15 },
  { name: "Browning", price: 17000, category: "Weapons", vipMode: "percent", vipPercent: 15 },
  { name: "Heavy Pistol", price: 20000, category: "Weapons", vipMode: "percent", vipPercent: 15 },
  { name: "Shotgun", price: 25000, category: "Weapons", vipMode: "fixed", vipFixedPrice: 21000 },
  { name: "Combat Shotgun", price: 30000, category: "Weapons", vipMode: "percent", vipPercent: 15 },

  { name: "Small Scope", price: 4000, category: "Attachments", vipMode: "percent", vipPercent: 15 },
  { name: "Medium Scope", price: 6000, category: "Attachments", vipMode: "percent", vipPercent: 15 },
  { name: "Large Scope", price: 8000, category: "Attachments", vipMode: "percent", vipPercent: 15 },

  { name: "Gun Bag", price: 12000, category: "Misc Items", vipMode: "percent", vipPercent: 15 },
  { name: "Adv Lockpick", price: 12000, category: "Misc Items", vipMode: "none" },
  { name: "Heavy Cutters", price: 1500, category: "Misc Items", vipMode: "none" },
];

export const ammoBulkItems = ["Pistol Ammo", "SMG Ammo", "Shotgun Ammo"];

const STORAGE_KEY = "gunstore_catalog";

export function getStoredCatalogProducts(): CatalogProduct[] {
  if (typeof window === "undefined") return defaultCatalogProducts;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCatalogProducts;

    const parsed = JSON.parse(raw) as CatalogProduct[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultCatalogProducts;
  } catch {
    return defaultCatalogProducts;
  }
}

export function saveStoredCatalogProducts(products: CatalogProduct[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}