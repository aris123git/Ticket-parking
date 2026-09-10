export const TARIFF_REF_MIN = 2;
export const TARIFF_REF_MAX = 5;

export function normalizeTariffRef(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidTariffRef(raw: string): boolean {
  const ref = normalizeTariffRef(raw);
  return /^[A-Z0-9]{2,5}$/.test(ref);
}

export function durationLabel(value: number, unit: "HOURS" | "WEEKS"): string {
  if (unit === "WEEKS") {
    return value === 1 ? "1 semaine" : `${value} semaines`;
  }
  return value === 1 ? "1 heure" : `${value} heures`;
}

export function durationLabelAscii(value: number, unit: "HOURS" | "WEEKS"): string {
  if (unit === "WEEKS") {
    return value === 1 ? "1 semaine" : `${value} semaines`;
  }
  return value === 1 ? "1 heure" : `${value} heures`;
}
