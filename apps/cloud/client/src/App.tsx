import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, formatFcfa, formatWhen } from "./api";

type Owner = { id: string; email: string; displayName: string };
type Period = "today" | "yesterday" | "week" | "month";

export default function App() {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<{ owner: Owner }>("/api/auth/me").then((d) => setOwner(d.owner)).catch(() => setOwner(null)).finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="wrap">Chargement…</div>;
  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={setOwner} />} />
      <Route path="/" element={owner ? <Overview owner={owner} onLogout={() => setOwner(null)} /> : <Navigate to="/login" />} />
      <Route path="/parkings/:id" element={owner ? <Parking owner={owner} onLogout={() => setOwner(null)} /> : <Navigate to="/login" />} />
    </Routes>
  );
}

function Login({ onLogin }: { onLogin: (o: Owner) => void }) {
  const nav = useNavigate();
  const [email, setEmail] = useState("proprio@parking.local");
  const [password, setPassword] = useState("proprio123");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const d = await api<{ owner: Owner }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(d.owner);
      nav("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    }
  }
  return (
    <div className="wrap">
      <form className="card" onSubmit={submit}>
        <div className="brand">PARKFLOW SUPERVISION</div>
        <h1>Espace proprietaire</h1>
        <p className="muted">Consultez a distance les recettes de vos parkings.</p>
        {error ? <div className="error">{error}</div> : null}
        <div className="field"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Mot de passe</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn btn-primary">Connexion</button>
      </form>
    </div>
  );
}

function PeriodBar({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const items: { id: Period; label: string }[] = [
    { id: "today", label: "Aujourd'hui" },
    { id: "yesterday", label: "Hier" },
    { id: "week", label: "Cette semaine" },
    { id: "month", label: "Ce mois" },
  ];
  return (
    <div className="filters">
      {items.map((i) => (
        <button key={i.id} className={value === i.id ? "active" : ""} onClick={() => onChange(i.id)}>{i.label}</button>
      ))}
    </div>
  );
}

function Header({ owner, onLogout }: { owner: Owner; onLogout: () => void }) {
  const nav = useNavigate();
  return (
    <header className="top">
      <Link to="/" style={{ textDecoration: "none" }}><strong>ParkFlow</strong> · Supervision</Link>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span>{owner.displayName}</span>
        <button className="btn btn-ghost" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); onLogout(); nav("/login"); }}>
          Deconnexion
        </button>
      </div>
    </header>
  );
}

function Overview({ owner, onLogout }: { owner: Owner; onLogout: () => void }) {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api(`/api/parkings?period=${period}`).then(setData);
  useEffect(() => { load(); }, [period]);
  async function claim(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/parkings/claim", { method: "POST", body: JSON.stringify({ pairingCode: code }) });
      setCode("");
      setMsg("Installation associee.");
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Association impossible");
    }
  }
  return (
    <div className="shell">
      <Header owner={owner} onLogout={onLogout} />
      <div className="page">
        <h1>Mes parkings</h1>
        <PeriodBar value={period} onChange={setPeriod} />
        <div className="kpis">
          <div className="kpi"><div className="muted">Total recettes</div><div className="val">{formatFcfa(data?.totalRevenue || 0)}</div></div>
          <div className="kpi"><div className="muted">Tickets vendus</div><div className="val">{data?.totalTickets || 0}</div></div>
          <div className="kpi"><div className="muted">Installations</div><div className="val">{data?.parkings?.length || 0}</div></div>
        </div>
        <div className="park-grid">
          {(data?.parkings || []).map((p: any) => (
            <Link className="park-card" key={p.id} to={`/parkings/${p.id}?period=${period}`}>
              <h3 style={{ margin: "0 0 8px" }}>{p.name}</h3>
              <div className="muted">{p.address}</div>
              <div className="val">{formatFcfa(p.revenue)}</div>
              <div className="muted">{p.tickets} tickets</div>
            </Link>
          ))}
        </div>
        <div className="panel">
          <h3>Associer une installation</h3>
          <p className="muted">Saisissez le code affiche dans le logiciel local (Synchronisation).</p>
          <form className="claim" onSubmit={claim}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" />
            <button className="btn btn-primary" style={{ width: "auto" }}>Associer</button>
          </form>
          {msg ? <p>{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Parking({ owner, onLogout }: { owner: Owner; onLogout: () => void }) {
  const { id } = useParams();
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api(`/api/parkings/${id}?period=${period}`).then(setData);
  }, [id, period]);
  if (!data) return <div className="wrap">Chargement…</div>;
  const max = Math.max(1, ...data.stats.byReference.map((r: any) => r.amount));
  return (
    <div className="shell">
      <Header owner={owner} onLogout={onLogout} />
      <div className="page">
        <p><Link to="/">← Tous les parkings</Link></p>
        <h1>{data.parking.name}</h1>
        <p className="muted">{data.parking.address} · {data.parking.phone}</p>
        <PeriodBar value={period} onChange={setPeriod} />
        <div className="kpis">
          <div className="kpi"><div className="muted">Recettes</div><div className="val">{formatFcfa(data.stats.revenue)}</div></div>
          <div className="kpi"><div className="muted">Tickets</div><div className="val">{data.stats.ticketsSold}</div></div>
          <div className="kpi"><div className="muted">Annulations</div><div className="val">{data.stats.ticketsCancelled}</div></div>
          <div className="kpi"><div className="muted">Remboursements</div><div className="val">{data.stats.ticketsRefunded}</div></div>
        </div>
        <div className="panel">
          <h3>References vendues</h3>
          {data.stats.byReference.map((r: any) => (
            <div className="bar" key={r.reference}>
              <strong>{r.reference}</strong>
              <div className="track"><div className="fill" style={{ width: `${(r.amount / max) * 100}%` }} /></div>
              <span>{r.count} · {formatFcfa(r.amount)}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Caissiers</h3>
          <table>
            <thead><tr><th>Nom</th><th>Role</th><th>Statut</th></tr></thead>
            <tbody>
              {data.cashiers.map((c: any) => (
                <tr key={c.id}><td>{c.display_name}</td><td>{c.role}</td><td>{c.is_active ? "Actif" : "Inactif"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Tarifs</h3>
          <table>
            <thead><tr><th>Ref</th><th>Libelle</th><th>Prix</th><th>Statut</th></tr></thead>
            <tbody>
              {data.tariffs.map((t: any) => (
                <tr key={t.id}><td>{t.reference}</td><td>{t.name}</td><td>{formatFcfa(t.price_fcfa)}</td><td>{t.is_active ? "Actif" : "Inactif"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Ventes</h3>
          <table>
            <thead><tr><th>Ticket</th><th>Date</th><th>Ref</th><th>Prix</th><th>Caissier</th><th>Statut</th></tr></thead>
            <tbody>
              {data.stats.sales.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.ticket_number}</td>
                  <td>{formatWhen(s.sold_at)}</td>
                  <td>{s.tariff_ref}</td>
                  <td>{formatFcfa(s.price_fcfa)}</td>
                  <td>{s.cashier_name}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Journal d'activite</h3>
          <table>
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Operation</th><th>Raison</th></tr></thead>
            <tbody>
              {data.audit.map((e: any) => (
                <tr key={e.id}><td>{formatWhen(e.created_at)}</td><td>{e.user_name}</td><td>{e.operation}</td><td>{e.reason || ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
