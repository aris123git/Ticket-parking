import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import {
  encodeEscPos,
  renderTicketText,
  renderZReportText,
  type TicketPrintData,
  type PaperWidth,
  type ZReportData,
} from "@parkflow/shared";
import { getDataDir } from "./db.js";
import { getSetting } from "./seed.js";

const execFileAsync = promisify(execFile);

export type SalePrintInput = {
  tariff_ref: string;
  tariff_name: string;
  duration_value: number;
  duration_unit: "HOURS" | "WEEKS";
  price_fcfa: number;
  ticket_number: string;
  sold_at: string;
  cashier_name: string;
  payment_method?: string;
  amount_received?: number | null;
  change_fcfa?: number | null;
};

export type PrintResult = {
  ok: boolean;
  target: string;
  previewText: string;
  error?: string;
};

export function printerConfig() {
  const width = getSetting("printer_width") === "58" ? 58 : 80;
  return {
    width: width as PaperWidth,
    target: getSetting("printer_target") || "preview",
    host: getSetting("printer_host") || "127.0.0.1",
    port: Number(getSetting("printer_port") || 9100),
    path: getSetting("printer_path") || "",
    printerName: getSetting("printer_name") || "",
    alignment: getSetting("printer_alignment") || "center",
    fontSize: Number(getSetting("printer_font_size") || 1),
    showAddress: getSetting("printer_show_address") !== "0",
    showPhone: getSetting("printer_show_phone") !== "0",
    showHeader: getSetting("printer_show_header") !== "0",
    showFooter: getSetting("printer_show_footer") !== "0",
    showCashier: getSetting("printer_show_cashier") === "1",
  };
}

export function saleFromRow(row: Record<string, unknown>): SalePrintInput {
  return {
    tariff_ref: String(row.tariff_ref),
    tariff_name: String(row.tariff_name),
    duration_value: Number(row.duration_value),
    duration_unit: row.duration_unit as "HOURS" | "WEEKS",
    price_fcfa: Number(row.price_fcfa),
    ticket_number: String(row.ticket_number),
    sold_at: String(row.sold_at),
    cashier_name: String(row.cashier_name),
    payment_method: String(row.payment_method || "CASH"),
    amount_received: row.amount_received == null ? Number(row.price_fcfa) : Number(row.amount_received),
    change_fcfa: Number(row.change_fcfa || 0),
  };
}

export function buildTicketData(sale: SalePrintInput, duplicate = false): TicketPrintData {
  const cfg = printerConfig();
  return {
    parkingName: getSetting("parking_name") || "Parking",
    address: getSetting("parking_address") || "",
    phone: getSetting("parking_phone") || "",
    header: getSetting("ticket_header") || "",
    footer: getSetting("ticket_footer") || "Merci",
    tariffRef: sale.tariff_ref,
    tariffName: sale.tariff_name,
    durationValue: sale.duration_value,
    durationUnit: sale.duration_unit,
    priceFcfa: sale.price_fcfa,
    ticketNumber: sale.ticket_number,
    soldAt: sale.sold_at,
    cashierName: sale.cashier_name,
    paymentMethod: sale.payment_method || "CASH",
    amountReceived: sale.amount_received ?? sale.price_fcfa,
    changeFcfa: sale.change_fcfa ?? 0,
    duplicate,
    showAddress: cfg.showAddress,
    showPhone: cfg.showPhone,
    showHeader: cfg.showHeader,
    showFooter: cfg.showFooter,
    showCashier: cfg.showCashier,
  };
}

export async function printTicket(sale: SalePrintInput, options?: { duplicate?: boolean }): Promise<PrintResult> {
  const cfg = printerConfig();
  const data = buildTicketData(sale, Boolean(options?.duplicate));
  return sendEscPos(renderTicketText(data, cfg.width), "last-ticket");
}

export async function printZReport(report: Omit<ZReportData, "parkingName"> & { parkingName?: string }): Promise<PrintResult> {
  const cfg = printerConfig();
  const text = renderZReportText(
    {
      ...report,
      parkingName: report.parkingName || getSetting("parking_name") || "Parking",
    },
    cfg.width,
  );
  return sendEscPos(text, "last-z-report");
}

async function sendEscPos(previewText: string, basename: string): Promise<PrintResult> {
  const cfg = printerConfig();
  const buffer = encodeEscPos(previewText);
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${basename}.txt`), previewText, "utf8");
  const binPath = path.join(dir, `${basename}.bin`);
  fs.writeFileSync(binPath, buffer);

  if (cfg.target === "preview") {
    return { ok: true, target: "preview", previewText };
  }

  try {
    if (cfg.target === "file") {
      if (!cfg.path) throw new Error("Chemin d'imprimante non configure");
      fs.writeFileSync(cfg.path, buffer);
      return { ok: true, target: "file", previewText };
    }
    if (cfg.target === "network") {
      await sendTcp(cfg.host, cfg.port, buffer);
      return { ok: true, target: "network", previewText };
    }
    if (cfg.target === "windows") {
      await printWindowsRaw(cfg.printerName, binPath);
      return { ok: true, target: "windows", previewText };
    }
    throw new Error(`Cible d'impression inconnue: ${cfg.target}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, target: cfg.target, previewText, error };
  }
}

export async function listWindowsPrinters(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true, timeout: 8000 },
    );
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function printWindowsRaw(printerName: string, binPath: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("L'impression par nom Windows n'est disponible que sur un PC Windows");
  }
  const name = printerName.trim();
  if (!name || /[\r\n"]/.test(name) || name.length > 120) {
    throw new Error("Nom d'imprimante Windows invalide ou manquant");
  }
  const dest = `\\\\localhost\\${name}`;
  await execFileAsync("cmd.exe", ["/d", "/s", "/c", "copy", "/b", binPath, dest], {
    windowsHide: true,
    timeout: 8000,
  });
}

function sendTcp(host: string, port: number, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Imprimante reseau injoignable (delai depasse)"));
    }, 2500);
    socket.on("connect", () => {
      socket.write(buffer, (writeErr) => {
        clearTimeout(timer);
        socket.end();
        if (writeErr) reject(writeErr);
        else resolve();
      });
    });
    socket.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
