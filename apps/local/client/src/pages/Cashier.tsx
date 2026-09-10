import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "../App";
import { api, durationLabel, formatFcfa } from "../api";

type Tariff = {
  id: string;
  reference: string;
  name: string;
  duration_value: number;
  duration_unit: "HOURS" | "WEEKS";
  price_fcfa: number;
};

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sync, setSync] = useState<{ online?: boolean; pending?: { total: number } }>({});

  useEffect(() => {
    api<{ tariffs: Tariff[] }>("/api/tariffs").then((d) => setTariffs(d.tariffs));
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

  async function sell(tariff: Tariff) {
    if (busyId) return;
    setBusyId(tariff.id);
    try {
      const result = await api<{
        sale: { ticket_number: string; price_fcfa: number; tariff_ref: string };
        print: { ok: boolean; previewText: string; error?: string };
      }>("/api/sales", { method: "POST", body: JSON.stringify({ tariffId: tariff.id }) });
      const printNote = result.print.ok ? "imprime" : `impression echouee: ${result.print.error || ""}`;
      setToast(`${result.print.previewText}\n\nTicket ${result.sale.ticket_number} ${printNote}`);
      setTimeout(() => setToast(null), 6000);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Vente impossible");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

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
          <button key={t.id} className="tariff-btn" disabled={!!busyId} onClick={() => sell(t)}>
            <div className="ref">{t.reference}</div>
            <div className="dur">{durationLabel(t.duration_value, t.duration_unit)}</div>
            <div className="price">{formatFcfa(t.price_fcfa)}</div>
          </button>
        ))}
      </div>
      <footer className="pos-bottom">
        <div className="muted">Un clic = vente + impression immediate</div>
        <div style={{ display: "flex", gap: 8 }}>
          {user.role === "ADMIN" ? <Link className="btn btn-ghost" to="/admin">Administration</Link> : null}
          <button className="btn btn-ghost" onClick={logout}>Deconnexion</button>
        </div>
      </footer>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
