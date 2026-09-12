import { toPrinterAscii } from "./accents.js";
import { formatDate, formatDateTime, formatTime } from "./dates.js";
import { formatFcfa } from "./money.js";
import { paymentLabel } from "./payment.js";
import { durationLabelAscii } from "./validation.js";

export type PaperWidth = 58 | 80;

export type TicketPrintData = {
  parkingName: string;
  address?: string;
  phone?: string;
  header?: string;
  footer?: string;
  tariffRef: string;
  tariffName: string;
  durationValue: number;
  durationUnit: "HOURS" | "WEEKS";
  priceFcfa: number;
  ticketNumber: string;
  soldAt: string;
  cashierName?: string;
  paymentMethod?: string;
  amountReceived?: number;
  changeFcfa?: number;
  duplicate?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  showCashier?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
};

export type ZReportData = {
  parkingName: string;
  closedAt: string;
  periodStart: string;
  periodEnd: string;
  ticketsCount: number;
  theoreticalAmount: number;
  declaredAmount: number;
  difference: number;
  cashierName: string;
  closedByName: string;
  notes?: string;
  byPayment: { method: string; count: number; amount: number }[];
};

export function paperChars(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

export function padCenter(text: string, width: number): string {
  const t = text.slice(0, width);
  const space = width - t.length;
  const left = Math.floor(space / 2);
  return " ".repeat(left) + t + " ".repeat(space - left);
}

export function lineSep(width: number): string {
  return "-".repeat(width);
}

export function wrapLine(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= width) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function renderTicketText(data: TicketPrintData, width: PaperWidth = 80): string {
  const w = paperChars(width);
  const lines: string[] = [];
  const pushCenter = (text: string) => {
    for (const l of wrapLine(toPrinterAscii(text), w)) {
      lines.push(padCenter(l, w));
    }
  };
  const pushLeft = (text: string) => {
    for (const l of wrapLine(toPrinterAscii(text), w)) {
      lines.push(l);
    }
  };

  lines.push("");
  pushCenter(data.parkingName.toUpperCase());
  if (data.showAddress !== false && data.address) pushCenter(data.address);
  if (data.showPhone !== false && data.phone) pushCenter(data.phone);
  if (data.showHeader !== false && data.header) {
    lines.push(lineSep(w));
    pushCenter(data.header);
  }
  lines.push(lineSep(w));
  pushCenter("TICKET PARKING");
  if (data.duplicate) pushCenter("DUPLICATA");
  lines.push("");
  pushLeft(`Ref : ${data.tariffRef}`);
  pushLeft(`Duree : ${durationLabelAscii(data.durationValue, data.durationUnit)}`);
  pushLeft(`Prix : ${formatFcfa(data.priceFcfa)}`);
  if (data.paymentMethod) {
    pushLeft(`Paiement : ${paymentLabel(data.paymentMethod)}`);
    if (data.paymentMethod === "CASH" && data.amountReceived != null) {
      pushLeft(`Recu : ${formatFcfa(data.amountReceived)}`);
      pushLeft(`Monnaie : ${formatFcfa(data.changeFcfa ?? 0)}`);
    }
  }
  lines.push("");
  pushLeft(`Ticket N : ${data.ticketNumber}`);
  lines.push("");
  pushLeft(`Date : ${formatDate(data.soldAt)}`);
  pushLeft(`Heure : ${formatTime(data.soldAt)}`);
  if (data.showCashier && data.cashierName) {
    pushLeft(`Caissier : ${toPrinterAscii(data.cashierName)}`);
  }
  lines.push(lineSep(w));
  if (data.showFooter !== false) {
    pushCenter(data.footer || "Merci");
  }
  lines.push("");
  return lines.join("\n");
}

const ESC = 0x1b;
const GS = 0x1d;

export function encodeEscPos(text: string, options?: { cut?: boolean; alignCenterTitle?: boolean }): Buffer {
  const chunks: number[] = [];
  chunks.push(ESC, 0x40);
  chunks.push(ESC, 0x74, 0x00);
  chunks.push(ESC, 0x61, 0x00);
  const ascii = toPrinterAscii(text);
  for (const ch of ascii) {
    chunks.push(ch.charCodeAt(0) & 0xff);
  }
  chunks.push(0x0a, 0x0a, 0x0a);
  if (options?.cut !== false) {
    chunks.push(GS, 0x56, 0x00);
  }
  return Buffer.from(chunks);
}

export function renderZReportText(data: ZReportData, width: PaperWidth = 80): string {
  const w = paperChars(width);
  const lines: string[] = [];
  const pushCenter = (text: string) => {
    for (const l of wrapLine(toPrinterAscii(text), w)) {
      lines.push(padCenter(l, w));
    }
  };
  const pushLeft = (text: string) => {
    for (const l of wrapLine(toPrinterAscii(text), w)) {
      lines.push(l);
    }
  };

  lines.push("");
  pushCenter(data.parkingName.toUpperCase());
  lines.push(lineSep(w));
  pushCenter("Z DE CAISSE");
  lines.push(lineSep(w));
  pushLeft(`Cloture : ${formatDateTime(data.closedAt)}`);
  pushLeft(`Debut : ${formatDateTime(data.periodStart)}`);
  pushLeft(`Fin : ${formatDateTime(data.periodEnd)}`);
  pushLeft(`Caissier : ${toPrinterAscii(data.cashierName)}`);
  pushLeft(`Par : ${toPrinterAscii(data.closedByName)}`);
  lines.push(lineSep(w));
  pushLeft(`Tickets : ${data.ticketsCount}`);
  pushLeft(`Theorique : ${formatFcfa(data.theoreticalAmount)}`);
  pushLeft(`Declare : ${formatFcfa(data.declaredAmount)}`);
  pushLeft(`Ecart : ${formatFcfa(data.difference)}`);
  if (data.byPayment.length) {
    lines.push(lineSep(w));
    pushCenter("PAR PAIEMENT");
    for (const row of data.byPayment) {
      pushLeft(`${paymentLabel(row.method)} : ${row.count} / ${formatFcfa(row.amount)}`);
    }
  }
  if (data.notes) {
    lines.push(lineSep(w));
    pushLeft(`Note : ${data.notes}`);
  }
  lines.push(lineSep(w));
  pushCenter("Fin de rapport Z");
  lines.push("");
  return lines.join("\n");
}
