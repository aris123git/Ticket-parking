import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { User } from "../App";
import { api, durationLabel, formatFcfa, formatWhen } from "../api";

type Period = "today" | "yesterday" | "week" | "month";

export default function Admin({
  user,
  parkingName,
  onLogout,
}: {
  user: User;
  parkingName: string;
  onLogout: () => void;
}) {
  const nav = useNavigate();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
    nav("/login");
  }
  return (
    <div className="admin">
      <aside className="side">
        <div className="brand" style={{ padding: "8px 12px 16px" }}>PARKFLOW</div>
        <div style={{ padding: "0 12px 12px", fontWeight: 800 }}>{parkingName}</div>
        <NavLink to="/admin" end>Tableau de bord</NavLink>
        <NavLink to="/admin/ventes">Ventes</NavLink>
        <NavLink to="/admin/tarifs">Tarifs</NavLink>
        <NavLink to="/admin/caissiers">Caissiers</NavLink>
        <NavLink to="/admin/caisse">Cloture de caisse</NavLink>
        <NavLink to="/admin/imprimante">Imprimante</NavLink>
        <NavLink to="/admin/parking">Parking</NavLink>
        <NavLink to="/admin/journal">Journal</NavLink>
        <NavLink to="/admin/sync">Synchronisation</NavLink>
        <Link to="/caisse">Ecran caisse</Link>
        <button className="nav" onClick={logout}>Deconnexion</button>
        <div className="muted" style={{ padding: 12, marginTop: "auto" }}>{user.displayName}</div>
      </aside>
      <main className="main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="ventes" element={<Sales />} />
          <Route path="tarifs" element={<Tariffs />} />
          <Route path="caissiers" element={<Users />} />
          <Route path="caisse" element={<Cash />} />
          <Route path="imprimante" element={<Printer />} />
          <Route path="parking" element={<Parking />} />
          <Route path="journal" element={<Audit />} />
          <Route path="sync" element={<Sync />} />
        </Routes>
      </main>
    </div>
  );
}

function PeriodFilters({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const items: { id: Period; label: string }[] = [
    { id: "today", label: "Aujourd'hui" },
    { id: "yesterday", label: "Hier" },
    { id: "week", label: "Cette semaine" },
    { id: "month", label: "Ce mois" },
  ];
  return (
    <div className="filters">
      {items.map((i) => (
        <button key={i.id} className={value === i.id ? "active" : ""} onClick={() => onChange(i.id)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Dashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api(`/api/dashboard?period=${period}`).then(setData);
  }, [period]);
  if (!data) return <p>Chargement…</p>;
  const maxHour = Math.max(1, ...data.byHour.map((h: any) => h.amount));
  return (
    <div>
      <h2>Tableau de bord</h2>
      <PeriodFilters value={period} onChange={setPeriod} />
      <div className="kpis">
        <div className="kpi"><div className="lbl">Recettes</div><div className="val">{formatFcfa(data.revenue)}</div></div>
        <div className="kpi"><div className="lbl">Tickets vendus</div><div className="val">{data.ticketsSold}</div></div>
        <div className="kpi"><div className="lbl">Annulations</div><div className="val">{data.ticketsCancelled}</div></div>
        <div className="kpi"><div className="lbl">Remboursements</div><div className="val">{data.ticketsRefunded}</div></div>
      </div>
      <div className="panel">
        <h3>Repartition par type de ticket</h3>
        <div className="bars">
          {data.byReference.map((r: any) => (
            <div className="bar" key={r.reference}>
              <strong>{r.reference}</strong>
              <div className="track"><div className="fill" style={{ width: `${Math.max(8, (r.amount / Math.max(data.revenue, 1)) * 100)}%` }} /></div>
              <span>{r.count} · {formatFcfa(r.amount)}</span>
            </div>
          ))}
          {!data.byReference.length ? <p className="muted">Aucune vente sur cette periode.</p> : null}
        </div>
      </div>
      <div className="panel">
        <h3>Performance des caissiers</h3>
        <table>
          <thead><tr><th>Caissier</th><th>Tickets</th><th>Montant</th></tr></thead>
          <tbody>
            {data.byCashier.map((c: any) => (
              <tr key={c.cashierId}><td>{c.cashierName}</td><td>{c.count}</td><td>{formatFcfa(c.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Ventes par heure</h3>
        <div className="bars">
          {data.byHour.filter((h: any) => h.count).map((h: any) => (
            <div className="bar" key={h.hour}>
              <span>{String(h.hour).padStart(2, "0")}h</span>
              <div className="track"><div className="fill" style={{ width: `${(h.amount / maxHour) * 100}%` }} /></div>
              <span>{h.count} · {formatFcfa(h.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sales() {
  const [period, setPeriod] = useState<Period>("today");
  const [sales, setSales] = useState<any[]>([]);
  const [reason, setReason] = useState("");
  const load = () => api<{ sales: any[] }>(`/api/sales?period=${period}`).then((d) => setSales(d.sales));
  useEffect(() => { load(); }, [period]);

  async function act(id: string, kind: "cancel" | "refund") {
    await api(`/api/sales/${id}/${kind}`, { method: "POST", body: JSON.stringify({ reason }) });
    setReason("");
    load();
  }

  return (
    <div>
      <h2>Ventes</h2>
      <PeriodFilters value={period} onChange={setPeriod} />
      <div className="panel">
        <p className="muted">Annulation et remboursement reservés à l'administrateur. La vente d'origine est conservee.</p>
        <div className="field"><label>Raison obligatoire</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif de l'operation" /></div>
      </div>
      <table>
        <thead>
          <tr><th>Ticket</th><th>Heure</th><th>Ref</th><th>Prix</th><th>Caissier</th><th>Statut</th><th></th></tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{s.ticket_number}</td>
              <td>{formatWhen(s.sold_at)}</td>
              <td>{s.tariff_ref}</td>
              <td>{formatFcfa(s.price_fcfa)}</td>
              <td>{s.cashier_name}</td>
              <td className={`status-${s.status}`}>{s.status}</td>
              <td className="row-actions">
                <button className="btn btn-ghost" onClick={() => api(`/api/sales/${s.id}/reprint`, { method: "POST" })}>Reimprimer</button>
                {s.status === "SOLD" ? (
                  <>
                    <button className="btn btn-danger" onClick={() => act(s.id, "cancel")}>Annuler</button>
                    <button className="btn btn-ghost" onClick={() => act(s.id, "refund")}>Rembourser</button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tariffs() {
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [form, setForm] = useState({ id: "", reference: "", name: "", durationValue: 1, durationUnit: "HOURS", priceFcfa: 0, isActive: true, reason: "" });
  const load = () => api<{ tariffs: any[] }>("/api/tariffs?all=1").then((d) => setTariffs(d.tariffs));
  useEffect(() => { load(); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = JSON.stringify(form);
    if (form.id) await api(`/api/tariffs/${form.id}`, { method: "PUT", body });
    else await api("/api/tariffs", { method: "POST", body });
    setForm({ id: "", reference: "", name: "", durationValue: 1, durationUnit: "HOURS", priceFcfa: 0, isActive: true, reason: "" });
    load();
  }

  return (
    <div>
      <h2>Tarifs</h2>
      <p className="muted">Les prix des tickets deja vendus ne changent jamais. Toute modification est historisee.</p>
      <form className="panel form-grid" onSubmit={save}>
        <div className="field"><label>Reference (2-5)</label><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
        <div className="field"><label>Libelle</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="field"><label>Duree</label><input type="number" min={1} value={form.durationValue} onChange={(e) => setForm({ ...form, durationValue: Number(e.target.value) })} /></div>
        <div className="field"><label>Unite</label>
          <select value={form.durationUnit} onChange={(e) => setForm({ ...form, durationUnit: e.target.value })}>
            <option value="HOURS">Heures</option>
            <option value="WEEKS">Semaines</option>
          </select>
        </div>
        <div className="field"><label>Prix (FCFA)</label><input type="number" min={0} value={form.priceFcfa} onChange={(e) => setForm({ ...form, priceFcfa: Number(e.target.value) })} /></div>
        <div className="field"><label>Raison (mise a jour mensuelle)</label><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        <div className="field"><label>Actif</label>
          <select value={form.isActive ? "1" : "0"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
            <option value="1">Actif</option>
            <option value="0">Inactif</option>
          </select>
        </div>
        <div className="field"><label>&nbsp;</label><button className="btn btn-primary">{form.id ? "Enregistrer" : "Creer"}</button></div>
      </form>
      <table>
        <thead><tr><th>Ref</th><th>Libelle</th><th>Duree</th><th>Prix</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          {tariffs.map((t) => (
            <tr key={t.id}>
              <td>{t.reference}</td>
              <td>{t.name}</td>
              <td>{durationLabel(t.duration_value, t.duration_unit)}</td>
              <td>{formatFcfa(t.price_fcfa)}</td>
              <td>{t.is_active ? "Actif" : "Inactif"}</td>
              <td><button className="btn btn-ghost" onClick={() => setForm({ id: t.id, reference: t.reference, name: t.name, durationValue: t.duration_value, durationUnit: t.duration_unit, priceFcfa: t.price_fcfa, isActive: !!t.is_active, reason: "" })}>Modifier</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ id: "", username: "", displayName: "", role: "CASHIER", password: "", isActive: true });
  const load = () => api<{ users: any[] }>("/api/users").then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    const body = JSON.stringify(form);
    if (form.id) await api(`/api/users/${form.id}`, { method: "PUT", body });
    else await api("/api/users", { method: "POST", body });
    setForm({ id: "", username: "", displayName: "", role: "CASHIER", password: "", isActive: true });
    load();
  }
  return (
    <div>
      <h2>Caissiers</h2>
      <form className="panel form-grid" onSubmit={save}>
        <div className="field"><label>Identifiant</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
        <div className="field"><label>Nom affiche</label><input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></div>
        <div className="field"><label>Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="CASHIER">Caissier</option>
            <option value="ADMIN">Administrateur</option>
          </select>
        </div>
        <div className="field"><label>Mot de passe</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? "Laisser vide pour ne pas changer" : ""} /></div>
        <div className="field"><label>Statut</label>
          <select value={form.isActive ? "1" : "0"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}>
            <option value="1">Actif</option>
            <option value="0">Desactive</option>
          </select>
        </div>
        <div className="field"><label>&nbsp;</label><button className="btn btn-primary">{form.id ? "Enregistrer" : "Creer"}</button></div>
      </form>
      <table>
        <thead><tr><th>Identifiant</th><th>Nom</th><th>Role</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td><td>{u.display_name}</td><td>{u.role}</td><td>{u.is_active ? "Actif" : "Desactive"}</td>
              <td><button className="btn btn-ghost" onClick={() => setForm({ id: u.id, username: u.username, displayName: u.display_name, role: u.role, password: "", isActive: !!u.is_active })}>Modifier</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cash() {
  const [period, setPeriod] = useState<Period>("today");
  const [dash, setDash] = useState<any>(null);
  const [declared, setDeclared] = useState(0);
  const [notes, setNotes] = useState("");
  const [closures, setClosures] = useState<any[]>([]);
  const load = () => {
    api(`/api/dashboard?period=${period}`).then(setDash);
    api<{ closures: any[] }>("/api/cash-closures").then((d) => setClosures(d.closures));
  };
  useEffect(() => { load(); }, [period]);
  async function closeCash(e: FormEvent) {
    e.preventDefault();
    await api("/api/cash-closures", { method: "POST", body: JSON.stringify({ period, declaredAmount: declared, notes }) });
    setNotes("");
    load();
  }
  const theoretical = dash?.revenue || 0;
  return (
    <div>
      <h2>Cloture de caisse</h2>
      <PeriodFilters value={period} onChange={setPeriod} />
      <div className="kpis">
        <div className="kpi"><div className="lbl">Theorique</div><div className="val">{formatFcfa(theoretical)}</div></div>
        <div className="kpi"><div className="lbl">Declare</div><div className="val">{formatFcfa(declared)}</div></div>
        <div className="kpi"><div className="lbl">Difference</div><div className="val">{formatFcfa(declared - theoretical)}</div></div>
      </div>
      <form className="panel form-grid" onSubmit={closeCash}>
        <div className="field"><label>Montant declare (FCFA)</label><input type="number" value={declared} onChange={(e) => setDeclared(Number(e.target.value))} /></div>
        <div className="field"><label>Commentaire</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="field"><label>&nbsp;</label><button className="btn btn-primary">Cloturer</button></div>
      </form>
      <table>
        <thead><tr><th>Date</th><th>Caissier</th><th>Theorique</th><th>Declare</th><th>Ecart</th><th>Tickets</th></tr></thead>
        <tbody>
          {closures.map((c) => (
            <tr key={c.id}>
              <td>{formatWhen(c.closed_at)}</td>
              <td>{c.cashier_name}</td>
              <td>{formatFcfa(c.theoretical_amount)}</td>
              <td>{formatFcfa(c.declared_amount)}</td>
              <td>{formatFcfa(c.difference)}</td>
              <td>{c.tickets_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Printer() {
  const [cfg, setCfg] = useState<any>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    api<{ printer: any }>("/api/settings").then((d) => setCfg(d.printer));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    const d = await api<{ printer: any }>("/api/printer", { method: "PUT", body: JSON.stringify(cfg) });
    setCfg(d.printer);
  }
  async function testPrint() {
    const d = await api<{ print: { previewText: string } }>("/api/printer/test", { method: "POST" });
    setPreview(d.print.previewText);
  }
  if (!cfg) return null;
  return (
    <div>
      <h2>Imprimante thermique</h2>
      <form className="panel form-grid" onSubmit={save}>
        <div className="field"><label>Largeur</label>
          <select value={cfg.width} onChange={(e) => setCfg({ ...cfg, width: Number(e.target.value) })}>
            <option value={58}>58 mm</option>
            <option value={80}>80 mm</option>
          </select>
        </div>
        <div className="field"><label>Cible</label>
          <select value={cfg.target} onChange={(e) => setCfg({ ...cfg, target: e.target.value })}>
            <option value="preview">Apercu (sans imprimante)</option>
            <option value="network">Reseau (port 9100)</option>
            <option value="file">Fichier / peripherique</option>
          </select>
        </div>
        <div className="field"><label>Hote</label><input value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} /></div>
        <div className="field"><label>Port</label><input type="number" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} /></div>
        <div className="field"><label>Chemin fichier</label><input value={cfg.path} onChange={(e) => setCfg({ ...cfg, path: e.target.value })} /></div>
        <div className="field"><label>Adresse sur ticket</label>
          <select value={cfg.showAddress ? "1" : "0"} onChange={(e) => setCfg({ ...cfg, showAddress: e.target.value === "1" })}><option value="1">Oui</option><option value="0">Non</option></select>
        </div>
        <div className="field"><label>Telephone</label>
          <select value={cfg.showPhone ? "1" : "0"} onChange={(e) => setCfg({ ...cfg, showPhone: e.target.value === "1" })}><option value="1">Oui</option><option value="0">Non</option></select>
        </div>
        <div className="field"><label>Nom caissier</label>
          <select value={cfg.showCashier ? "1" : "0"} onChange={(e) => setCfg({ ...cfg, showCashier: e.target.value === "1" })}><option value="1">Oui</option><option value="0">Non</option></select>
        </div>
        <div className="field"><label>&nbsp;</label><button className="btn btn-primary">Enregistrer</button></div>
      </form>
      <button className="btn btn-ok" onClick={testPrint}>Imprimer un ticket test</button>
      {preview ? <pre className="preview" style={{ marginTop: 16 }}>{preview}</pre> : null}
    </div>
  );
}

function Parking() {
  const [form, setForm] = useState({ parkingName: "", parkingAddress: "", parkingPhone: "", ticketHeader: "", ticketFooter: "", cloudUrl: "" });
  useEffect(() => {
    api<any>("/api/settings").then(setForm);
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
  }
  return (
    <div>
      <h2>Configuration du parking</h2>
      <form className="panel" onSubmit={save}>
        <div className="field"><label>Nom</label><input value={form.parkingName} onChange={(e) => setForm({ ...form, parkingName: e.target.value })} /></div>
        <div className="field"><label>Adresse</label><input value={form.parkingAddress} onChange={(e) => setForm({ ...form, parkingAddress: e.target.value })} /></div>
        <div className="field"><label>Telephone</label><input value={form.parkingPhone} onChange={(e) => setForm({ ...form, parkingPhone: e.target.value })} /></div>
        <div className="field"><label>En-tete ticket</label><input value={form.ticketHeader} onChange={(e) => setForm({ ...form, ticketHeader: e.target.value })} /></div>
        <div className="field"><label>Pied de ticket</label><input value={form.ticketFooter} onChange={(e) => setForm({ ...form, ticketFooter: e.target.value })} /></div>
        <div className="field"><label>URL serveur de supervision</label><input value={form.cloudUrl} onChange={(e) => setForm({ ...form, cloudUrl: e.target.value })} /></div>
        <button className="btn btn-primary">Enregistrer</button>
      </form>
    </div>
  );
}

function Audit() {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    api<{ events: any[] }>("/api/audit").then((d) => setEvents(d.events));
  }, []);
  return (
    <div>
      <h2>Journal d'activite</h2>
      <table>
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Role</th><th>Operation</th><th>Element</th><th>Raison</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{formatWhen(e.created_at)}</td>
              <td>{e.user_name}</td>
              <td>{e.user_role}</td>
              <td>{e.operation}</td>
              <td>{e.entity_type} {e.entity_id ? String(e.entity_id).slice(0, 8) : ""}</td>
              <td>{e.reason || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sync() {
  const [data, setData] = useState<any>(null);
  const load = () => api("/api/sync").then(setData);
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h2>Synchronisation</h2>
      {data ? (
        <>
          <div className="kpis">
            <div className="kpi"><div className="lbl">Etat</div><div className="val">{data.online ? "En ligne" : "Hors ligne"}</div></div>
            <div className="kpi"><div className="lbl">En attente</div><div className="val">{data.pending?.total ?? 0}</div></div>
          </div>
          <div className="panel">
            <p>Identifiant d'installation</p>
            <pre className="preview">{data.installation?.installationId}</pre>
            <p>Code d'association a saisir sur le site proprietaire</p>
            <pre className="preview">{data.installation?.pairingCode}</pre>
            <p className="muted">Derniere erreur : {data.lastError || "aucune"}</p>
            <div className="row-actions">
              <button className="btn btn-primary" onClick={async () => setData(await api("/api/sync/now", { method: "POST" }))}>Synchroniser maintenant</button>
              <button className="btn btn-ghost" onClick={async () => { await api("/api/sync/pairing-code", { method: "POST" }); load(); }}>Nouveau code</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
