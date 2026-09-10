import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  encodeEscPos,
  renderTicketText,
  type TicketPrintData,
  type PaperWidth,
} from "@parkflow/shared";
import { DATA_DIR } from "./db.js";
import { getSetting } from "./seed.js";

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
    alignment: getSetting("printer_alignment") || "center",
    fontSize: Number(getSetting("printer_font_size") || 1),
    showAddress: getSetting("printer_show_address") !== "0",
    showPhone: getSetting("printer_show_phone") !== "0",
    showHeader: getSetting("printer_show_header") !== "0",
    showFooter: getSetting("printer_show_footer") !== "0",
    showCashier: getSetting("printer_show_cashier") === "1",
  };
}

export function buildTicketData(sale: {
  tariff_ref: string;
  tariff_name: string;
  duration_value: number;
  duration_unit: "HOURS" | "WEEKS";
  price_fcfa: number;
  ticket_number: string;
  sold_at: string;
  cashier_name: string;
}): TicketPrintData {
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
    showAddress: cfg.showAddress,
    showPhone: cfg.showPhone,
    showHeader: cfg.showHeader,
    showFooter: cfg.showFooter,
    showCashier: cfg.showCashier,
  };
}

export async function printTicket(sale: Parameters<typeof buildTicketData>[0]): Promise<PrintResult> {
  const cfg = printerConfig();
  const data = buildTicketData(sale);
  const previewText = renderTicketText(data, cfg.width);
  const buffer = encodeEscPos(previewText);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "last-ticket.txt"), previewText, "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "last-ticket.bin"), buffer);

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
    throw new Error(`Cible d'impression inconnue: ${cfg.target}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, target: cfg.target, previewText, error };
  }
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
