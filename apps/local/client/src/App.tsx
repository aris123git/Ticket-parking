import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import Admin from "./pages/Admin";
import Cashier from "./pages/Cashier";
import Login from "./pages/Login";
import Setup from "./pages/Setup";

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: "CASHIER" | "ADMIN";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [parkingName, setParkingName] = useState("Parking");
  const [ready, setReady] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ needed: boolean; parkingName: string }>("/api/setup/status").catch(() => ({ needed: false, parkingName: "Parking" })),
      api<{ user: User; parkingName: string }>("/api/auth/me").catch(() => null),
    ]).then(([setup, me]) => {
      setSetupNeeded(setup.needed);
      if (setup.parkingName) setParkingName(setup.parkingName);
      if (me) {
        setUser(me.user);
        setParkingName(me.parkingName);
      } else {
        setUser(null);
      }
    }).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="login-wrap">Chargement…</div>;
  if (setupNeeded) {
    return (
      <Setup
        onDone={(name) => {
          setSetupNeeded(false);
          setParkingName(name);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={(u, n) => { setUser(u); setParkingName(n); }} />} />
      <Route
        path="/"
        element={
          user ? (
            user.role === "ADMIN" ? <Navigate to="/admin" replace /> : <Navigate to="/caisse" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/caisse"
        element={
          user ? (
            <Cashier user={user} parkingName={parkingName} onLogout={() => setUser(null)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/admin/*"
        element={
          user?.role === "ADMIN" ? (
            <Admin user={user} parkingName={parkingName} onLogout={() => setUser(null)} />
          ) : user ? (
            <Navigate to="/caisse" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
