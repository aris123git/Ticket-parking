import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "./seed.js";

const JWT_SECRET = process.env.LOCAL_JWT_SECRET || "parkflow-local-dev-secret-change-me";
const COOKIE = "parkflow_local";

export function signUser(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" });
}

export type AuthedRequest = Request & { user?: AuthUser };

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE] || bearer(req);
  if (!token) {
    res.status(401).json({ error: "Authentification requise" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = {
      id: payload.id,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      isActive: true,
    };
    next();
  } catch {
    res.status(401).json({ error: "Session expiree" });
  }
}

export function adminOnly(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Action reservee a l'administrateur" });
    return;
  }
  next();
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);
  return null;
}
