import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "../App";
import { api, durationLabel, formatFcfa, paymentLabel } from "../api";

type Tariff = {
  id: string;
  reference: string;
  name: string;
  duration_value: number;
  duration_unit: "HOURS" | "WEEKS";
  price_fcfa: number;
};

type PayMethod = "CASH" | "ORANGE_MONEY" | "MOOV_MONEY" | "CARD";

const PAY_BUTTONS: { id: PayMethod; label: string }[] = [
  { id: "CASH", label: "Especes" },
  { id: "ORANGE_MONEY", label: "Orange Money" },
  { id: "MOOV_MONEY", label: "Moov Money" },
  { id: "CARD", label: "Carte" },
];

export default function Cashier({
  user,
  parkingName,
  onLogout,
}: {
  user: User;
  parkingName: string;
  onLogout: () => void;
}) {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [clock, setClock] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sync, setSync] = useState<{ online?: boolean; pending?: { total: number } }>({});
  const [pending, setPending] = useState<Tariff | null>(null);
  const [received, setReceived] = useState("");
  const [lastTicket, setLastTicket] = useState<string | null>(null);

  useEffect(() => {
    api<{ tariffs: Tariff[] }>("/api/tariffs").then((d) => setTariffs(d.tariffs));
    api<{ sale: { ticket_number: string } | null }>("/api/sales/last")
      .then((d) => setLastTicket(d.sale?.ticket_number ?? null))
      .catch(() => {});
    const t = setInterval(() => setClock(new Date()), 1000);
    const s = setInterval(() => {
      api<{ sync: { online: boolean; pending: { total: number } } }>("/api/auth/me")
        .then((d) => setSync(d.sync))
        .catch(() => {});
    }, 5000);
    return () => {
      clearInterval(t);
      clearInterval(s);
    };
  }, []);

  function showToast(text: string, ms = 6000) {
    setToast(text);
    setTimeout(() => setToast(null), ms);
  }

  async function confirmPay(method: PayMethod) {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { tariffId: pending.id, paymentMethod: method };
      if (method === "CASH" && received) body.amountReceived = Number(received);
      const result = await api<{
        sale: { ticket_number: string; price_fcfa: number; change_fcfa: number; payment_method: string };
        print: { ok: boolean; previewText: string; error?: string };
      }>("/api/sales", { method: "POST", body: JSON.stringify(body) });
      setLastTicket(result.sale.ticket_number);
      const printNote = result.print.ok ? "imprime" : `impression echouee: ${result.print.error || ""}`;
      const changeNote =
        method === "CASH" && result.sale.change_fcfa
          ? `\nMonnaie : ${formatFcfa(result.sale.change_fcfa)}`
          : "";
      showToast(`${result.print.previewText}\n\n${paymentLabel(result.sale.payment_method)} · Ticket ${result.sale.ticket_number} ${printNote}${changeNote}`);
      setPending(null);
      setReceived("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Vente impossible", 4000);
    } finally {
      setBusy(false);
    }
  }

  async function reprintLast() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api<{
        sale: { ticket_number: string };
        print: { ok: boolean; previewText: string; error?: string };
      }>("/api/sales/last/reprint", { method: "POST" });
      const printNote = result.print.ok ? "reimprime" : `echec: ${result.print.error || ""}`;
      showToast(`${result.print.previewText}\n\nTicket ${result.sale.ticket_number} ${printNote}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Aucune vente a reimprimer", 4000);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  const change =
    pending && received ? Math.max(0, Number(received || 0) - pending.price_fcfa) : pending ? 0 : 0;

  return (
    <div className="pos">
      <header className="pos-top">
        <div>
          <div className="pos-name">{parkingName}</div>
          <div className="muted">Caissier : {user.displayName}</div>
        </div>
        <div className="clock">{clock.toLocaleString("fr-FR")}</div>
        <span className={`badge ${sync.online ? "online" : "offline"}`}>
          {sync.online ? "En ligne" : "Hors ligne"}
          {sync.pending?.total ? ` · ${sync.pending.total} en attente` : ""}
        </span>
      </header>
      <div className="tariff-grid">
        {tariffs.map((t) => (
          <button key={t.id} className="tariff-btn" disabled={busy} onClick={() => { setPending(t); setReceived(""); }}>
            <div className="ref">{t.reference}</div>
            <div className="dur">{durationLabel(t.duration_value, t.duration_unit)}</div>
            <div className="price">{formatFcfa(t.price_fcfa)}</div>
          </button>
        ))}
      </div>
      <footer className="pos-bottom">
        <div className="muted">
          Tarif puis paiement — {lastTicket ? `dernier ticket ${lastTicket}` : "aucun ticket encore"}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ok" disabled={busy} onClick={reprintLast}>Reimprimer le dernier</button>
          {user.role === "ADMIN" ? <Link className="btn btn-ghost" to="/admin">Administration</Link> : null}
          <button className="btn btn-ghost" onClick={logout}>Deconnexion</button>
        </div>
      </footer>
      {pending ? (
        <div className="pay-overlay" onClick={() => !busy && setPending(null)}>
          <div className="pay-card" onClick={(e) => e.stopPropagation()}>
            <div className="muted">Encaissement</div>
            <h2 style={{ margin: "4px 0 8px" }}>{pending.reference} · {pending.name}</h2>
            <div className="pay-amount">{formatFcfa(pending.price_fcfa)}</div>
            <div className="pay-methods">
              {PAY_BUTTONS.map((b) => (
                <button key={b.id} className={`pay-method ${b.id === "CASH" ? "cash" : ""}`} disabled={busy} onClick={() => confirmPay(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>
            <div className="pay-cash">
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Recu (especes) — vide = montant exact</label>
                <input value={received} readOnly placeholder={String(pending.price_fcfa)} />
              </div>
              <div className="muted">Monnaie : {formatFcfa(change)}</div>
              <div className="keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "00"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (k === "C") setReceived("");
                      else setReceived((prev) => (prev + k).replace(/^0+(?=\d)/, "").slice(0, 9));
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 12, width: "100%" }} disabled={busy} onClick={() => setPending(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
