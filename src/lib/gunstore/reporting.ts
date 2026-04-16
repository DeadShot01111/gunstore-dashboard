import {
  CommissionPayoutRecord,
  CommissionRateRecord,
  PersonOverrideRecord,
} from "./commissions";
import { MaterialPurchase } from "./materials";
import { WeeklyBusinessSummary, WeeklyEmployeeCommission } from "./export-business-performance";
import { SavedOrder } from "./types";
import {
  formatBusinessDate,
  getBusinessDateKey,
  getWeekRange,
  isWithinWeek,
} from "./week";

export type WeeklyCommissionRow = WeeklyEmployeeCommission & {
  totalProfit: number;
  salesCount: number;
  notes: string;
};

export function formatDisplayDate(value: string | Date) {
  return formatBusinessDate(value);
}

export function getWeekStartKey(anchor: Date) {
  const { start } = getWeekRange(anchor);
  return getBusinessDateKey(start);
}

export function getWeekOrders(orders: SavedOrder[], weekAnchor: Date) {
  return orders.filter((order) => isWithinWeek(order.createdAt, weekAnchor));
}

export function getWeekMaterials(
  purchases: MaterialPurchase[],
  weekAnchor: Date
) {
  return purchases.filter((purchase) =>
    isWithinWeek(purchase.createdAt, weekAnchor)
  );
}

export function buildWeeklyCommissionRows(params: {
  weekOrders: SavedOrder[];
  commissionPayouts: CommissionPayoutRecord[];
  commissionRates?: CommissionRateRecord[];
  personOverrides: PersonOverrideRecord[];
  weekAnchor: Date;
}): WeeklyCommissionRow[] {
  const {
    weekOrders,
    commissionPayouts,
    commissionRates = [],
    personOverrides,
    weekAnchor,
  } = params;
  const weekStartKey = getWeekStartKey(weekAnchor);
  const commissionRateMap = new Map(
    commissionRates.map((rate) => [rate.productName, Number(rate.commissionPercent ?? 0)])
  );
  const grouped = new Map<
    string,
    {
      salesCount: number;
      salesTotal: number;
      totalProfit: number;
      commissionEarned: number;
      appliedRates: number[];
    }
  >();

  for (const order of weekOrders) {
    const personOverridePercent = personOverrides.find(
      (entry) => entry.employeeName === order.employeeName
    )?.commissionPercent;

    const current = grouped.get(order.employeeName) ?? {
      salesCount: 0,
      salesTotal: 0,
      totalProfit: 0,
      commissionEarned: 0,
      appliedRates: [],
    };

    let orderProfit = 0;
    let orderCommission = 0;

    for (const item of order.items ?? []) {
      const itemProfit = Number(item.totalProfit ?? 0);
      const storedPercent = Number(item.commissionPercent ?? 0);
      const fallbackPercent = Number(commissionRateMap.get(item.name) ?? 0);
      const baseProductPercent =
        storedPercent > 0 ? storedPercent : fallbackPercent;
      const effectivePercent =
        personOverridePercent != null
          ? personOverridePercent
          : baseProductPercent;

      orderProfit += itemProfit;
      orderCommission += Math.round(itemProfit * (effectivePercent / 100));

      if (effectivePercent > 0) {
        current.appliedRates.push(effectivePercent);
      }
    }

    if (orderProfit === 0) {
      orderProfit = Number(order.totalProfit ?? 0);
    }

    grouped.set(order.employeeName, {
      salesCount: current.salesCount + 1,
      salesTotal: current.salesTotal + Number(order.total ?? 0),
      totalProfit: current.totalProfit + orderProfit,
      commissionEarned: current.commissionEarned + orderCommission,
      appliedRates: current.appliedRates,
    });
  }

  return Array.from(grouped.entries())
    .map(([employeeName, values]) => {
      const savedPayout = commissionPayouts.find(
        (payout) =>
          payout.employeeName === employeeName &&
          getBusinessDateKey(payout.weekStart) === weekStartKey
      );

      const averageRate =
        values.appliedRates.length > 0
          ? Math.round(
              values.appliedRates.reduce((sum, rate) => sum + rate, 0) /
                values.appliedRates.length
            )
          : 0;

      return {
        employeeName,
        salesCount: values.salesCount,
        salesTotal: values.salesTotal,
        totalProfit: values.totalProfit,
        commissionRate: averageRate,
        commissionEarned: values.commissionEarned,
        status: savedPayout?.status ?? "Unpaid",
        notes: savedPayout?.notes ?? "",
      };
    })
    .sort((a, b) => b.commissionEarned - a.commissionEarned);
}

export function buildWeeklyBusinessSummary(params: {
  weekOrders: SavedOrder[];
  weekMaterials: MaterialPurchase[];
  weeklyCommissions: WeeklyCommissionRow[];
  weekAnchor: Date;
}): WeeklyBusinessSummary {
  const { weekOrders, weekMaterials, weeklyCommissions, weekAnchor } = params;
  const weekRange = getWeekRange(weekAnchor);

  const salesRevenue = weekOrders.reduce(
    (sum, order) => sum + Number(order.total ?? 0),
    0
  );
  const discounts = weekOrders.reduce(
    (sum, order) => sum + Number(order.discount ?? 0),
    0
  );
  const grossProfit = weekOrders.reduce(
    (sum, order) => sum + Number(order.totalProfit ?? 0),
    0
  );

  const materialExpensesTotal = weekMaterials.reduce(
    (sum, purchase) => sum + Number(purchase.totalCost ?? 0),
    0
  );
  const materialExpensesPaid = weekMaterials
    .filter((purchase) => purchase.reimbursementStatus === "Paid")
    .reduce((sum, purchase) => sum + Number(purchase.totalCost ?? 0), 0);
  const materialExpensesUnpaid = weekMaterials
    .filter((purchase) => purchase.reimbursementStatus === "Unpaid")
    .reduce((sum, purchase) => sum + Number(purchase.totalCost ?? 0), 0);

  const commissionTotal = weeklyCommissions.reduce(
    (sum, row) => sum + Number(row.commissionEarned ?? 0),
    0
  );
  const commissionPaid = weeklyCommissions
    .filter((row) => row.status === "Paid")
    .reduce((sum, row) => sum + Number(row.commissionEarned ?? 0), 0);
  const commissionUnpaid = weeklyCommissions
    .filter((row) => row.status === "Unpaid")
    .reduce((sum, row) => sum + Number(row.commissionEarned ?? 0), 0);

  return {
    weekLabel: `${formatDisplayDate(weekRange.start)} - ${formatDisplayDate(weekRange.end)}`,
    salesRevenue,
    discounts,
    materialExpensesTotal,
    materialExpensesPaid,
    materialExpensesUnpaid,
    commissionTotal,
    commissionPaid,
    commissionUnpaid,
    actualProfit: grossProfit - materialExpensesPaid - commissionPaid,
    projectedProfit: grossProfit - materialExpensesTotal - commissionTotal,
  };
}
