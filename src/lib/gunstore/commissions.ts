import { supabase } from "@/lib/supabase/client";

export type CommissionStatus = "Paid" | "Unpaid";

export type CommissionRateRecord = {
  id: string;
  productName: string;
  commissionPercent: number;
};

export type CommissionPayoutRecord = {
  id: string;
  weekStart: string;
  employeeName: string;
  status: CommissionStatus;
  notes?: string;
};

type DbCommissionRateRow = {
  id: string;
  product_name: string;
  commission_percent: number;
};

type DbCommissionPayoutRow = {
  id: string;
  week_start: string;
  employee_name: string;
  status: string;
  notes: string | null;
};

function toCommissionRate(row: DbCommissionRateRow): CommissionRateRecord {
  return {
    id: row.id,
    productName: row.product_name,
    commissionPercent: Number(row.commission_percent ?? 0),
  };
}

function toCommissionPayout(row: DbCommissionPayoutRow): CommissionPayoutRecord {
  return {
    id: row.id,
    weekStart: row.week_start,
    employeeName: row.employee_name,
    status: (row.status as CommissionStatus) ?? "Unpaid",
    notes: row.notes ?? "",
  };
}

export async function getCommissionRatesFromSupabase(): Promise<CommissionRateRecord[]> {
  const { data, error } = await supabase
    .from("commission_rates")
    .select("*")
    .order("product_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbCommissionRateRow[]).map(toCommissionRate);
}

export async function upsertCommissionRateInSupabase(params: {
  productName: string;
  commissionPercent: number;
}) {
  const { error } = await supabase.from("commission_rates").upsert(
    {
      product_name: params.productName,
      commission_percent: Number(params.commissionPercent ?? 0),
    },
    { onConflict: "product_name" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function saveCommissionRatesBatchInSupabase(
  records: CommissionRateRecord[]
) {
  const payload = records.map((record) => ({
    product_name: record.productName,
    commission_percent: Number(record.commissionPercent ?? 0),
  }));

  const { error } = await supabase
    .from("commission_rates")
    .upsert(payload, { onConflict: "product_name" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCommissionPayoutsFromSupabase(): Promise<CommissionPayoutRecord[]> {
  const { data, error } = await supabase
    .from("commission_payouts")
    .select("*")
    .order("week_start", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DbCommissionPayoutRow[]).map(toCommissionPayout);
}

export async function upsertCommissionPayoutInSupabase(params: {
  weekStart: string;
  employeeName: string;
  status: CommissionStatus;
  notes?: string;
}) {
  const { data: existing, error: fetchError } = await supabase
    .from("commission_payouts")
    .select("id")
    .eq("week_start", params.weekStart)
    .eq("employee_name", params.employeeName)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("commission_payouts")
      .update({
        status: params.status,
        notes: params.notes ?? "",
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return existing.id;
  }

  const { data, error } = await supabase
    .from("commission_payouts")
    .insert({
      week_start: params.weekStart,
      employee_name: params.employeeName,
      status: params.status,
      notes: params.notes ?? "",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export function getCommissionPercentForProduct(
  productName: string,
  rates: CommissionRateRecord[]
) {
  const match = rates.find((item) => item.productName === productName);
  return Number(match?.commissionPercent ?? 0);
}