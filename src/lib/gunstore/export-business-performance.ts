import ExcelJS from "exceljs";
import { SavedOrder } from "./types";
import { MaterialPurchase } from "./materials";

export type WeeklyEmployeeCommission = {
  employeeName: string;
  salesTotal: number;
  commissionRate: number;
  commissionEarned: number;
  status: "Paid" | "Unpaid";
};

export type WeeklyBusinessSummary = {
  weekLabel: string;
  salesRevenue: number;
  discounts: number;
  materialExpensesTotal: number;
  materialExpensesPaid: number;
  materialExpensesUnpaid: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionUnpaid: number;
  actualProfit: number;
  projectedProfit: number;
};

function moneyFormat(cell: ExcelJS.Cell) {
  cell.numFmt = '$#,##0;[Red]-$#,##0';
}

function styleTitleRow(row: ExcelJS.Row) {
  row.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "left" };
  row.height = 24;

  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF7A0000" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF3A3A3A" } },
      left: { style: "thin", color: { argb: "FF3A3A3A" } },
      bottom: { style: "thin", color: { argb: "FF3A3A3A" } },
      right: { style: "thin", color: { argb: "FF3A3A3A" } },
    };
  });
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 20;

  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F1F1F" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF4A4A4A" } },
      left: { style: "thin", color: { argb: "FF4A4A4A" } },
      bottom: { style: "thin", color: { argb: "FF4A4A4A" } },
      right: { style: "thin", color: { argb: "FF4A4A4A" } },
    };
  });
}

function styleBodyRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFE0E0E0" } },
      left: { style: "thin", color: { argb: "FFE0E0E0" } },
      bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
      right: { style: "thin", color: { argb: "FFE0E0E0" } },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
}

function autoFitColumns(worksheet: ExcelJS.Worksheet, minWidth = 12, maxWidth = 28) {
  worksheet.columns?.forEach((column) => {
    let maxLength = minWidth;

    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? "" : String(cell.value);
      maxLength = Math.max(maxLength, value.length + 2);
    });

    column.width = Math.min(Math.max(maxLength, minWidth), maxWidth);
  });
}

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob(
    [buffer],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function exportBusinessPerformanceWorkbook(params: {
  summary: WeeklyBusinessSummary;
  weeklyCommissions: WeeklyEmployeeCommission[];
  weekMaterials: MaterialPurchase[];
  weekOrders: SavedOrder[];
}) {
  const { summary, weeklyCommissions, weekMaterials, weekOrders } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gunstore 60";
  workbook.company = "Gunstore 60";
  workbook.subject = "Weekly Business Performance";
  workbook.title = `Business Performance - ${summary.weekLabel}`;
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Weekly Summary", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  summarySheet.mergeCells("A1:G1");
  summarySheet.getCell("A1").value = `Gunstore 60 Weekly Business Performance`;
  styleTitleRow(summarySheet.getRow(1));

  summarySheet.mergeCells("A2:G2");
  summarySheet.getCell("A2").value = `Week: ${summary.weekLabel}`;
  summarySheet.getCell("A2").font = { italic: true, color: { argb: "FF666666" } };

  summarySheet.addRow([
    "Sales Revenue",
    "Discounts",
    "Material Expenses",
    "Commission Expenses",
    "Actual Profit",
    "Projected Profit",
    "Notes",
  ]);
  styleHeaderRow(summarySheet.getRow(3));

  summarySheet.addRow([
    summary.salesRevenue,
    summary.discounts,
    summary.materialExpensesTotal,
    summary.commissionTotal,
    summary.actualProfit,
    summary.projectedProfit,
    "Actual profit uses only paid-out costs. Projected profit includes all logged costs.",
  ]);
  styleBodyRow(summarySheet.getRow(4));

  for (const cellRef of ["A4", "B4", "C4", "D4", "E4", "F4"]) {
    moneyFormat(summarySheet.getCell(cellRef));
  }

  summarySheet.addRow([]);
  summarySheet.addRow(["Expense Breakdown", "", "", "", "", "", ""]);
  styleTitleRow(summarySheet.getRow(6));

  summarySheet.addRow(["Category", "Total", "Paid", "Unpaid"]);
  styleHeaderRow(summarySheet.getRow(7));

  summarySheet.addRow([
    "Material Purchases",
    summary.materialExpensesTotal,
    summary.materialExpensesPaid,
    summary.materialExpensesUnpaid,
  ]);
  styleBodyRow(summarySheet.getRow(8));

  summarySheet.addRow([
    "Commissions",
    summary.commissionTotal,
    summary.commissionPaid,
    summary.commissionUnpaid,
  ]);
  styleBodyRow(summarySheet.getRow(9));

  ["B8", "C8", "D8", "B9", "C9", "D9"].forEach((cellRef) => {
    moneyFormat(summarySheet.getCell(cellRef));
  });

  autoFitColumns(summarySheet, 14, 36);

  const commissionsSheet = workbook.addWorksheet("Commissions", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  commissionsSheet.addRow(["Commission Breakdown"]);
  styleTitleRow(commissionsSheet.getRow(1));

  commissionsSheet.addRow([
    "Employee",
    "Sales Total",
    "Commission Rate %",
    "Commission Earned",
    "Status",
  ]);
  styleHeaderRow(commissionsSheet.getRow(2));

  weeklyCommissions.forEach((row) => {
    const added = commissionsSheet.addRow([
      row.employeeName,
      row.salesTotal,
      row.commissionRate,
      row.commissionEarned,
      row.status,
    ]);
    styleBodyRow(added);
    moneyFormat(added.getCell(2));
    moneyFormat(added.getCell(4));

    if (row.status === "Paid") {
      added.getCell(5).font = { bold: true, color: { argb: "FF0F7B0F" } };
    } else {
      added.getCell(5).font = { bold: true, color: { argb: "FFB77900" } };
    }
  });

  autoFitColumns(commissionsSheet, 14, 24);

  const materialsSheet = workbook.addWorksheet("Material Expenses", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  materialsSheet.addRow(["Material Purchase Breakdown"]);
  styleTitleRow(materialsSheet.getRow(1));

  materialsSheet.addRow([
    "Date",
    "Material",
    "Quantity",
    "Unit Price",
    "Total Cost",
    "Purchased By",
    "Reimbursed",
    "Notes",
  ]);
  styleHeaderRow(materialsSheet.getRow(2));

  weekMaterials.forEach((purchase) => {
    const added = materialsSheet.addRow([
      new Date(purchase.createdAt).toLocaleString(),
      purchase.material,
      purchase.quantity,
      purchase.unitPrice,
      purchase.totalCost,
      purchase.purchasedBy ?? "",
      purchase.reimbursementStatus,
      purchase.notes ?? "",
    ]);
    styleBodyRow(added);
    moneyFormat(added.getCell(4));
    moneyFormat(added.getCell(5));

    if (purchase.reimbursementStatus === "Paid") {
      added.getCell(7).font = { bold: true, color: { argb: "FF0F7B0F" } };
    } else {
      added.getCell(7).font = { bold: true, color: { argb: "FFB77900" } };
    }
  });

  autoFitColumns(materialsSheet, 14, 30);

  const salesSheet = workbook.addWorksheet("Sales Logs", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  salesSheet.addRow(["Sales Log Breakdown"]);
  styleTitleRow(salesSheet.getRow(1));

  salesSheet.addRow([
    "Date",
    "Employee",
    "VIP",
    "Subtotal",
    "Discount",
    "Total",
    "Status",
  ]);
  styleHeaderRow(salesSheet.getRow(2));

  weekOrders.forEach((order) => {
    const added = salesSheet.addRow([
      new Date(order.createdAt).toLocaleString(),
      order.employeeName,
      order.vipEnabled ? "Yes" : "No",
      order.subtotal,
      order.discount,
      order.total,
      order.status ?? "Completed",
    ]);
    styleBodyRow(added);
    moneyFormat(added.getCell(4));
    moneyFormat(added.getCell(5));
    moneyFormat(added.getCell(6));
  });

  autoFitColumns(salesSheet, 14, 24);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `gunstore-business-performance-${summary.weekLabel.replace(/[\/\s]/g, "-")}.xlsx`);
}