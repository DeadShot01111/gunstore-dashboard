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

export type PersonOverrideRecord = {
  id: string;
  employeeName: string;
  commissionPercent: number;
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

type DbPersonOverrideRow = {
  id: string;
  employee_name: string;
  commission_percent: number;
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

function toPersonOverride(row: DbPersonOverrideRow): PersonOverrideRecord {
  return {
    id: row.id,
    employeeName: row.employee_name,
    commissionPercent: Number(row.commission_percent ?? 0),
  };
}

export async function getCommissionRatesFromSupabase(): Promise<CommissionRateRecord[]> {
  const { data, error } = await supabase
    .from("commission_rates")
    .select("*")
    .order("product_name", { ascending: true });

  if (error) {
    console.error("getCommissionRatesFromSupabase error:", error);
    throw new Error(error.message);
  }

  return ((data ?? []) as DbCommissionRateRow[]).map(toCommissionRate);
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
    console.error("saveCommissionRatesBatchInSupabase error:", error);
    throw new Error(error.message);
  }
}

export async function getCommissionPayoutsFromSupabase(): Promise<CommissionPayoutRecord[]> {
  const { data, error } = await supabase
    .from("commission_payouts")
    .select("*")
    .order("week_start", { ascending: false });

  if (error) {
    console.error("getCommissionPayoutsFromSupabase error:", error);
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
  const payload = [
    {
      week_start: params.weekStart,
      employee_name: params.employeeName,
      status: params.status,
      notes: params.notes ?? "",
    },
  ];

  const { data, error } = await supabase
    .from("commission_payouts")
    .upsert(payload, {
      onConflict: "week_start,employee_name",
    })
    .select();

  if (error) {
    console.error("upsertCommissionPayoutInSupabase error:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function getPersonOverridesFromSupabase(): Promise<PersonOverrideRecord[]> {
  const { data, error } = await supabase
    .from("commission_person_overrides")
    .select("*")
    .order("employee_name", { ascending: true });

  if (error) {
    console.error("getPersonOverridesFromSupabase error:", error);
    throw new Error(error.message);
  }

  return ((data ?? []) as DbPersonOverrideRow[]).map(toPersonOverride);
}

export async function upsertPersonOverrideInSupabase(params: {
  employeeName: string;
  commissionPercent: number;
}) {
  const { error } = await supabase
    .from("commission_person_overrides")
    .upsert(
      {
        employee_name: params.employeeName,
        commission_percent: Number(params.commissionPercent ?? 0),
      },
      { onConflict: "employee_name" }
    );

  if (error) {
    console.error("upsertPersonOverrideInSupabase error:", error);
    throw new Error(error.message);
  }
}

export function getCommissionPercentForProduct(
  productName: string,
  rates: CommissionRateRecord[]
) {
  const match = rates.find((item) => item.productName === productName);
  return Number(match?.commissionPercent ?? 0);
}