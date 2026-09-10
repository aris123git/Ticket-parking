import assert from "node:assert/strict";
import { test } from "node:test";
import { toPrinterAscii } from "./accents.js";
import { formatFcfa } from "./money.js";
import { isValidTariffRef, normalizeTariffRef } from "./validation.js";
import { renderTicketText } from "./ticket.js";

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
