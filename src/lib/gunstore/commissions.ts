export type CommissionStatus = "Paid" | "Unpaid";

export type CommissionPayoutRecord = {
  id: string;
  weekStart: string;
  employeeName: string;
  commissionRate: number;
  status: CommissionStatus;
  notes?: string;
};

const STORAGE_KEY = "gunstore_commission_payouts";
const DEFAULT_RATE_KEY = "gunstore_default_commission_rate";

export function getStoredCommissionPayouts(): CommissionPayoutRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as CommissionPayoutRecord[];

    return Array.isArray(parsed)
      ? parsed.map((item) => ({
          ...item,
          status: item.status ?? "Unpaid",
          notes: item.notes ?? "",
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveStoredCommissionPayouts(records: CommissionPayoutRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getStoredDefaultCommissionRate(): number {
  if (typeof window === "undefined") return 5;

  try {
    const raw = localStorage.getItem(DEFAULT_RATE_KEY);
    if (!raw) return 5;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 5;
  } catch {
    return 5;
  }
}

export function saveStoredDefaultCommissionRate(rate: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEFAULT_RATE_KEY, String(rate));
}