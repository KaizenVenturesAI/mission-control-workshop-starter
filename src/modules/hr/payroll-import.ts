import { execSync } from "child_process";
import {
  createPayment,
  createTimeEntry,
  listPayments,
  listTimeEntries,
  type PayrollPayment,
  type PayrollRateType,
  type PayrollTimeEntry,
} from "@/modules/hr/payroll-store";

export type PayrollImportSource = "miami-coaches" | "la-coaches" | "all";

type SheetReadResponse = {
  majorDimension?: string;
  range?: string;
  values?: string[][];
};

type ImportWarning = {
  source: Exclude<PayrollImportSource, "all">;
  rowNumber: number;
  message: string;
};

type TimeEntryCandidate = {
  employeeId: string;
  date: string;
  hours: number;
  rateType: PayrollRateType;
  rate: number;
  notes: string;
  location: string;
};

type PaymentCandidate = {
  employeeId: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
};

export interface PayrollImportResult {
  source: PayrollImportSource;
  rowsRead: Record<Exclude<PayrollImportSource, "all">, number>;
  timeEntriesCreated: number;
  paymentEntriesCreated: number;
  duplicatesSkipped: number;
  warnings: ImportWarning[];
}

const GWS_BIN = "/opt/homebrew/bin/gws";
const PAYMENT_METHOD = "Imported from Google Sheets";

const SOURCES = {
  "miami-coaches": {
    spreadsheetId: process.env.CLIENT_MIAMI_PAYROLL_SHEET_ID || "",
    tabName: "Stephan Hours Tracking",
    range: "A1:L200",
  },
  "la-coaches": {
    spreadsheetId: process.env.CLIENT_LA_PAYROLL_SHEET_ID || "",
    tabName: "Example Client LA Coach Hours Tracking",
    range: "A1:K200",
  },
} as const;

const LA_COACH_EMPLOYEE_MAP: Record<string, string> = {
  "gabi tella": "gabi-tella",
  "lorhan zaccarias": "lorhan-zaccarias",
  "tony dishenkian": "tony-dishenkian",
  "molly meek": "molly-meek",
  "rafa navas": "rafa-navas",
};

export function importPayrollSheets(source: PayrollImportSource = "all"): PayrollImportResult {
  const result: PayrollImportResult = {
    source,
    rowsRead: {
      "miami-coaches": 0,
      "la-coaches": 0,
    },
    timeEntriesCreated: 0,
    paymentEntriesCreated: 0,
    duplicatesSkipped: 0,
    warnings: [],
  };

  const sourcesToImport: Exclude<PayrollImportSource, "all">[] = source === "all"
    ? ["miami-coaches", "la-coaches"]
    : [source];

  const existingTimeEntryKeys = new Set(listTimeEntries().map(makeTimeEntryKey));
  const existingPaymentKeys = new Set(listPayments().map(makePaymentKey));

  for (const currentSource of sourcesToImport) {
    const rows = readSheetRows(currentSource);
    const dataRows = rows.slice(2).filter((row) => row.some((cell) => cell?.trim()));
    result.rowsRead[currentSource] = dataRows.length;

    for (const [index, row] of dataRows.entries()) {
      const rowNumber = index + 3;
      try {
        const mapped = currentSource === "miami-coaches"
          ? mapMiamiRow(row, rowNumber)
          : mapLaRow(row, rowNumber);

        for (const candidate of mapped.timeEntries) {
          const dedupeKey = makeTimeEntryKey(candidate);
          if (existingTimeEntryKeys.has(dedupeKey)) {
            result.duplicatesSkipped += 1;
            continue;
          }

          createTimeEntry({
            employeeId: candidate.employeeId,
            date: candidate.date,
            hours: candidate.hours,
            rateType: candidate.rateType,
            rate: candidate.rate,
            subtotal: candidate.rate * candidate.hours,
            notes: candidate.notes,
            location: candidate.location,
          });

          existingTimeEntryKeys.add(dedupeKey);
          result.timeEntriesCreated += 1;
        }

        for (const candidate of mapped.payments) {
          const dedupeKey = makePaymentKey(candidate);
          if (existingPaymentKeys.has(dedupeKey)) {
            result.duplicatesSkipped += 1;
            continue;
          }

          createPayment(candidate);
          existingPaymentKeys.add(dedupeKey);
          result.paymentEntriesCreated += 1;
        }

        result.warnings.push(...mapped.warnings.map((message) => ({ source: currentSource, rowNumber, message })));
      } catch (error) {
        result.warnings.push({
          source: currentSource,
          rowNumber,
          message: error instanceof Error ? error.message : "Unknown import error",
        });
      }
    }
  }

  return result;
}

function readSheetRows(source: Exclude<PayrollImportSource, "all">): string[][] {
  const config = SOURCES[source];
  const range = `'${config.tabName}'!${config.range}`;
  const command = `${GWS_BIN} sheets +read --spreadsheet ${shellEscape(config.spreadsheetId)} --range ${shellEscape(range)} --format json`;
  const output = execSync(command, { encoding: "utf-8" });
  const lines = output.split("\n");
  const jsonStart = lines.findIndex((line) => line.trim().startsWith("{"));

  if (jsonStart === -1) {
    throw new Error(`Unable to parse gws output for ${source}`);
  }

  const parsed = JSON.parse(lines.slice(jsonStart).join("\n")) as SheetReadResponse;
  return parsed.values ?? [];
}

function mapMiamiRow(row: string[], rowNumber: number) {
  const employeeId = "stephan-lebedev";
  const dateRaw = getCell(row, 1);
  if (!dateRaw) throw new Error(`Miami row ${rowNumber}: empty date — skipping empty row`);
  const date = parseSheetDate(dateRaw, `Miami row ${rowNumber}: invalid date`);
  const students = getCell(row, 2);
  const type = getCell(row, 4);
  const coachingHours = parseNumber(getCell(row, 5));
  const coachingRate = parseCurrency(getCell(row, 6));
  const opsHours = parseNumber(getCell(row, 7));
  const opsRate = parseCurrency(getCell(row, 8));
  const paymentOwed = parseCurrency(getCell(row, 9));
  const paymentStatus = getCell(row, 10).toLowerCase();
  const paymentDateRaw = getCell(row, 11);
  const notes = [students, type].filter(Boolean).join(" — ");

  const timeEntries: TimeEntryCandidate[] = [];
  const payments: PaymentCandidate[] = [];
  const warnings: string[] = [];

  if (coachingHours > 0) {
    if (coachingRate <= 0) {
      warnings.push("Coaching hours present but coaching rate is missing or zero; skipped coaching entry");
    } else {
      timeEntries.push({
        employeeId,
        date,
        hours: coachingHours,
        rateType: "coaching",
        rate: coachingRate,
        notes,
        location: "Miami",
      });
    }
  }

  if (opsHours > 0) {
    if (opsRate <= 0) {
      warnings.push("Ops hours present but ops rate is missing or zero; skipped ops entry");
    } else {
      timeEntries.push({
        employeeId,
        date,
        hours: opsHours,
        rateType: "hourly",
        rate: opsRate,
        notes,
        location: "Miami",
      });
    }
  }

  if (paymentStatus === "paid") {
    try {
      const paymentDate = paymentDateRaw ? parseSheetDate(paymentDateRaw, `Miami row ${rowNumber}: invalid payment date`) : null;
      if (!paymentDate) {
        warnings.push(`Miami row ${rowNumber}: marked paid but no payment date; recording payment with session date`);
        if (paymentOwed > 0) {
          payments.push({
            employeeId,
            date,
            amount: paymentOwed,
            method: PAYMENT_METHOD,
            notes: notes || "Imported from Miami coaches sheet (payment date unknown, using session date)",
          });
        }
      } else if (paymentOwed <= 0) {
        warnings.push("Marked paid but payment owed is missing or zero; skipped payment entry");
      } else {
        payments.push({
          employeeId,
          date: paymentDate,
          amount: paymentOwed,
          method: PAYMENT_METHOD,
          notes: notes || "Imported from Miami coaches sheet",
        });
      }
    } catch {
      warnings.push(`Miami row ${rowNumber}: invalid payment date '${paymentDateRaw}'; recording payment with session date`);
      if (paymentOwed > 0) {
        payments.push({
          employeeId,
          date,
          amount: paymentOwed,
          method: PAYMENT_METHOD,
          notes: notes || "Imported from Miami coaches sheet (payment date unparseable)",
        });
      }
    }
  }

  return { timeEntries, payments, warnings };
}

function mapLaRow(row: string[], rowNumber: number) {
  const coachName = getCell(row, 1);
  const employeeId = LA_COACH_EMPLOYEE_MAP[coachName.toLowerCase()];
  if (!employeeId) {
    throw new Error(`LA row ${rowNumber}: unknown coach name: ${coachName || "(blank)"}`);
  }

  const date = parseSheetDate(getCell(row, 2), `LA row ${rowNumber} for ${coachName}: invalid date`);
  const classHours = parseNumber(getCell(row, 3));
  const classRate = parseCurrency(getCell(row, 4));
  const laborHours = parseNumber(getCell(row, 5));
  const laborRate = parseCurrency(getCell(row, 6));
  const total = parseCurrency(getCell(row, 7));
  const paid = getCell(row, 8).toLowerCase();
  const datePaidRaw = getCell(row, 9);
  const notes = getCell(row, 10);

  const timeEntries: TimeEntryCandidate[] = [];
  const payments: PaymentCandidate[] = [];
  const warnings: string[] = [];

  if (classHours > 0) {
    if (classRate <= 0) {
      warnings.push("Class hours present but class rate is missing or zero; skipped coaching entry");
    } else {
      timeEntries.push({
        employeeId,
        date,
        hours: classHours,
        rateType: "coaching",
        rate: classRate,
        notes,
        location: "LA",
      });
    }
  }

  if (laborHours > 0) {
    if (laborRate <= 0) {
      warnings.push("Labor hours present but labor rate is missing or zero; skipped hourly entry");
    } else {
      timeEntries.push({
        employeeId,
        date,
        hours: laborHours,
        rateType: "hourly",
        rate: laborRate,
        notes,
        location: "LA",
      });
    }
  }

  if (paid === "yes") {
    try {
      const paymentDate = datePaidRaw ? parseSheetDate(datePaidRaw, `LA row ${rowNumber} for ${coachName}: invalid payment date`) : null;
      if (!paymentDate) {
        warnings.push(`LA row for ${coachName}: marked paid but no payment date; recording payment with session date`);
        if (total > 0) {
          payments.push({
            employeeId,
            date,
            amount: total,
            method: PAYMENT_METHOD,
            notes: notes || `Imported from LA coaches sheet (${coachName}, payment date unknown)`,
          });
        }
      } else if (total <= 0) {
        warnings.push("Marked paid but total is missing or zero; skipped payment entry");
      } else {
        payments.push({
          employeeId,
          date: paymentDate,
          amount: total,
          method: PAYMENT_METHOD,
          notes: notes || `Imported from LA coaches sheet (${coachName})`,
        });
      }
    } catch {
      warnings.push(`LA row for ${coachName}: invalid payment date '${datePaidRaw}'; recording payment with session date`);
      if (total > 0) {
        payments.push({
          employeeId,
          date,
          amount: total,
          method: PAYMENT_METHOD,
          notes: notes || `Imported from LA coaches sheet (${coachName}, payment date unparseable)`,
        });
      }
    }
  }

  return { timeEntries, payments, warnings };
}

function getCell(row: string[], index: number): string {
  return (row[index] ?? "").trim();
}

function parseNumber(value: string): number {
  if (!value) return 0;
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCurrency(value: string): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSheetDate(value: string, errorMessage: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(errorMessage);
  }

  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function shellEscape(value: string): string {
  return JSON.stringify(value);
}

function makeTimeEntryKey(entry: Pick<PayrollTimeEntry, "employeeId" | "date" | "hours" | "rateType">): string {
  return [entry.employeeId, entry.date, entry.hours, entry.rateType].join("|");
}

function makePaymentKey(payment: Pick<PayrollPayment, "employeeId" | "date" | "amount">): string {
  return [payment.employeeId, payment.date, payment.amount].join("|");
}
