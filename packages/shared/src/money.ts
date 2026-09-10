export function formatFcfa(amount: number): string {
  const abs = Math.abs(Math.trunc(amount));
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = amount < 0 ? "- " : "";
  return `${sign}${grouped} FCFA`;
}

export function parseFcfaInput(raw: string): number {
  const cleaned = raw.replace(/[^\d-]/g, "");
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}
