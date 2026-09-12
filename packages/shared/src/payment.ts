export const PAYMENT_METHODS = ["CASH", "ORANGE_MONEY", "MOOV_MONEY", "CARD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function paymentLabel(method: string): string {
  switch (method) {
    case "CASH":
      return "Especes";
    case "ORANGE_MONEY":
      return "Orange Money";
    case "MOOV_MONEY":
      return "Moov Money";
    case "CARD":
      return "Carte";
    default:
      return method;
  }
}

export type PaymentSettlement = {
  paymentMethod: PaymentMethod;
  amountReceived: number;
  changeFcfa: number;
};

export function settlePayment(
  priceFcfa: number,
  methodRaw: unknown,
  amountReceivedRaw: unknown,
): PaymentSettlement {
  if (!Number.isInteger(priceFcfa) || priceFcfa < 0) {
    throw Object.assign(new Error("Prix invalide"), { status: 400 });
  }
  const method = String(methodRaw ?? "CASH")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!isPaymentMethod(method)) {
    throw Object.assign(new Error("Mode de paiement invalide"), { status: 400 });
  }

  if (method !== "CASH") {
    return { paymentMethod: method, amountReceived: priceFcfa, changeFcfa: 0 };
  }

  const omitted =
    amountReceivedRaw == null ||
    amountReceivedRaw === "" ||
    (typeof amountReceivedRaw === "number" && Number.isNaN(amountReceivedRaw));
  const received = omitted ? priceFcfa : Number(amountReceivedRaw);
  if (!Number.isInteger(received) || received < 0) {
    throw Object.assign(new Error("Montant recu invalide"), { status: 400 });
  }
  if (received < priceFcfa) {
    throw Object.assign(new Error("Montant recu inferieur au prix du ticket"), { status: 400 });
  }
  return { paymentMethod: "CASH", amountReceived: received, changeFcfa: received - priceFcfa };
}
