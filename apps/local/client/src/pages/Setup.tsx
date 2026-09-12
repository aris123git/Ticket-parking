import { FormEvent, useState } from "react";
import { api } from "../api";

export default function Setup({ onDone }: { onDone: (parkingName: string) => void }) {
  const [parkingName, setParkingName] = useState("");
  const [parkingAddress, setParkingAddress] = useState("");
  const [parkingPhone, setParkingPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [cashierPassword, setCashierPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ parkingName: string }>("/api/setup", {
        method: "POST",
        body: JSON.stringify({
          parkingName,
          parkingAddress,
          parkingPhone,
          adminPassword,
          cashierPassword: cashierPassword || undefined,
        }),
      });
      onDone(data.parkingName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Configuration impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit} style={{ width: "min(520px, 100%)" }}>
        <div className="brand">PARKFLOW</div>
        <h1>Premiere installation</h1>
        <p>Comme une gestion commerciale : donnez un nom a votre parking et changez le mot de passe administrateur avant d&apos;encaisser.</p>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label>Nom du parking</label>
          <input value={parkingName} onChange={(e) => setParkingName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Adresse</label>
          <input value={parkingAddress} onChange={(e) => setParkingAddress(e.target.value)} />
        </div>
        <div className="field">
          <label>Telephone</label>
          <input value={parkingPhone} onChange={(e) => setParkingPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>Nouveau mot de passe admin</label>
          <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="field">
          <label>Nouveau mot de passe caissier (optionnel)</label>
          <input type="password" value={cashierPassword} onChange={(e) => setCashierPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Enregistrement…" : "Demarrer la caisse"}</button>
      </form>
    </div>
  );
}
