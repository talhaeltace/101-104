import jwt from 'jsonwebtoken';
import { getEnv, requireEnv } from './config';

export type JwtClaims = {
  sub: string; // userId
  username: string;
  role: string;
};

const ISSUER = 'mapflow-api';

export function signToken(claims: JwtClaims): string {
  const secret = requireEnv('JWT_SECRET');
  const expiresIn = getEnv('JWT_EXPIRES_IN') ?? '30d';
  return jwt.sign(claims, secret, { issuer: ISSUER, expiresIn });
}

export function verifyToken(token: string): JwtClaims {
  const secret = requireEnv('JWT_SECRET');
  const decoded = jwt.verify(token, secret, { issuer: ISSUER }) as any;
  return {
    sub: String(decoded.sub),
    username: String(decoded.username ?? ''),
    role: String(decoded.role ?? 'user'),
  };
}

export function getBearerToken(authHeader: string | undefined): string | null {
  const raw = String(authHeader ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
