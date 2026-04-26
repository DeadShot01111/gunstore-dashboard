import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (!match) continue;

  env[match[1]] = match[2].replace(/^['"]|['"]$/g, "").trim();
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const host = new URL(supabaseUrl).host;

console.log(`Supabase host: ${host}`);

const tables = [
  "products",
  "orders",
  "order_items",
  "commission_rates",
  "commission_payouts",
  "commission_person_overrides",
  "material_purchases",
  "ammo_promotions",
];

for (const table of tables) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.log(`${table}: ERROR ${error.code ?? ""} ${error.message}`);
  } else {
    console.log(`${table}: ${count ?? 0}`);
  }
}

const { data: products, error: productsError } = await supabase
  .from("products")
  .select("id")
  .eq("active", true);

if (productsError) {
  console.log(`active products: ERROR ${productsError.message}`);
} else {
  console.log(`active products: ${products?.length ?? 0}`);
}

const { data: recentOrders, error: recentOrdersError } = await supabase
  .from("orders")
  .select("created_at")
  .order("created_at", { ascending: false })
  .limit(1);

if (recentOrdersError) {
  console.log(`newest order: ERROR ${recentOrdersError.message}`);
} else {
  console.log(`newest order: ${recentOrders?.[0]?.created_at ?? "none"}`);
}
