import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const SECRET = process.env.CLOUD_JWT_SECRET || "parkflow-cloud-dev-secret-change-me";
const COOKIE = "parkflow_owner";

export type Owner = { id: string; email: string; displayName: string };

export function signOwner(owner: Owner): string {
  return jwt.sign(owner, SECRET, { expiresIn: "7d" });
}

export function setOwnerCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearOwnerCookie(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" });
}

export type OwnerRequest = Request & { owner?: Owner };

export function ownerRequired(req: OwnerRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (!token) {
    res.status(401).json({ error: "Authentification proprietaire requise" });
    return;
  }
  try {
    req.owner = jwt.verify(token, SECRET) as Owner;
    next();
  } catch {
    res.status(401).json({ error: "Session expiree" });
  }
}
