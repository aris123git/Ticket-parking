import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { User } from "../App";

export default function Login({ onLogin }: { onLogin: (u: User, parkingName: string) => void }) {
  const nav = useNavigate();
  const [username, setUsername] = useState("caissier");
  const [password, setPassword] = useState("caissier123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      const me = await api<{ parkingName: string }>("/api/auth/me");
      onLogin(data.user, me.parkingName);
      nav(data.user.role === "ADMIN" ? "/admin" : "/caisse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">PARKFLOW</div>
        <h1>Caisse parking</h1>
        <p>Logiciel de caisse installé sur cet ordinateur — fonctionne sans Internet</p>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label>Identifiant</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Connexion…" : "Entrer"}</button>
        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          Caissier : caissier / caissier123<br />
          Admin : admin / admin123
        </p>
      </form>
    </div>
  );
}
