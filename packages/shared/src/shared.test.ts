import assert from "node:assert/strict";
import { test } from "node:test";
import { toPrinterAscii } from "./accents.js";
import { formatFcfa } from "./money.js";
import { isValidTariffRef, normalizeTariffRef } from "./validation.js";
import { renderTicketText, renderZReportText } from "./ticket.js";

test("formatFcfa groups thousands with spaces", () => {
  assert.equal(formatFcfa(1000), "1 000 FCFA");
  assert.equal(formatFcfa(325500), "325 500 FCFA");
  assert.equal(formatFcfa(250), "250 FCFA");
});

test("tariff references are 2 to 5 alphanumerics", () => {
  assert.equal(isValidTariffRef("1H"), true);
  assert.equal(isValidTariffRef("24H"), true);
  assert.equal(isValidTariffRef("NUIT"), true);
  assert.equal(isValidTariffRef("A"), false);
  assert.equal(isValidTariffRef("TOOLONG"), false);
  assert.equal(normalizeTariffRef(" 1h "), "1H");
});

test("printer encoding strips accents", () => {
  assert.equal(toPrinterAscii("Merci d'être venu — Ouagadougou"), "Merci d'etre venu - Ouagadougou");
  assert.equal(toPrinterAscii("Durée"), "Duree");
});

test("ticket layout stays within 58mm width", () => {
  const text = renderTicketText(
    {
      parkingName: "Parking Central",
      tariffRef: "24H",
      tariffName: "Journalier",
      durationValue: 24,
      durationUnit: "HOURS",
      priceFcfa: 1000,
      ticketNumber: "202609-000125",
      soldAt: "2026-09-10T17:32:00.000Z",
      footer: "Merci",
    },
    58,
  );
  for (const line of text.split("\n")) {
    assert.ok(line.length <= 32, `"${line}" is ${line.length}`);
  }
  assert.match(text, /TICKET PARKING/);
  assert.match(text, /Ref : 24H/);
  assert.match(text, /Ticket N : 202609-000125/);
  assert.doesNotMatch(text, /[éèàùôî]/);
});

test("payment settlement computes cash change and exact mobile money", async () => {
  const { settlePayment, paymentLabel } = await import("./payment.js");
  assert.deepEqual(settlePayment(1000, "CASH", undefined), {
    paymentMethod: "CASH",
    amountReceived: 1000,
    changeFcfa: 0,
  });
  assert.equal(settlePayment(1000, "CASH", 2000).changeFcfa, 1000);
  assert.equal(settlePayment(1000, "ORANGE_MONEY", 5000).amountReceived, 1000);
  assert.equal(paymentLabel("MOOV_MONEY"), "Moov Money");
  assert.throws(() => settlePayment(1000, "CASH", 500));
});

test("ticket and Z report stay within 80mm and include payment", () => {
  const paid = renderTicketText(
    {
      parkingName: "Parking Central",
      tariffRef: "24H",
      tariffName: "Journalier",
      durationValue: 24,
      durationUnit: "HOURS",
      priceFcfa: 1000,
      ticketNumber: "202609-000125",
      soldAt: "2026-09-10T17:32:00.000Z",
      paymentMethod: "CASH",
      amountReceived: 2000,
      changeFcfa: 1000,
      duplicate: true,
      footer: "Merci",
    },
    80,
  );
  assert.match(paid, /DUPLICATA/);
  assert.match(paid, /Paiement : Especes/);
  assert.match(paid, /Monnaie : 1 000 FCFA/);
  const z = renderZReportText(
    {
      parkingName: "Parking Central",
      closedAt: "2026-09-10T18:00:00.000Z",
      periodStart: "2026-09-10T00:00:00.000Z",
      periodEnd: "2026-09-10T18:00:00.000Z",
      ticketsCount: 3,
      theoreticalAmount: 3000,
      declaredAmount: 3000,
      difference: 0,
      cashierName: "Aminata",
      closedByName: "Admin",
      byPayment: [{ method: "CASH", count: 2, amount: 2000 }, { method: "ORANGE_MONEY", count: 1, amount: 1000 }],
    },
    80,
  );
  assert.match(z, /Z DE CAISSE/);
  assert.match(z, /Orange Money/);
  for (const line of z.split("\n")) {
    assert.ok(line.length <= 48, `"${line}" is ${line.length}`);
  }
});
