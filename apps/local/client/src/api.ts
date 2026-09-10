export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  }
  return data as T;
}

export function formatFcfa(amount: number): string {
  const abs = Math.abs(Math.trunc(amount));
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${amount < 0 ? "- " : ""}${grouped} FCFA`;
}

export function durationLabel(value: number, unit: string): string {
  if (unit === "WEEKS") return value === 1 ? "1 semaine" : `${value} semaines`;
  return value === 1 ? "1 heure" : `${value} heures`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
