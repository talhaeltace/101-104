import 'dotenv/config';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { getBearerToken, verifyToken, type JwtClaims } from './auth';
import { requireEnv } from './config';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { maskEmail, sendOtpEmail } from './email';

type ReqUser = JwtClaims;

declare module 'fastify' {
  interface FastifyRequest {
    user?: ReqUser;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function randomOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code: string): string {
  // keyed hash so leaked DB doesn't reveal codes
  const pepper = requireEnv('OTP_PEPPER');
  return crypto.createHmac('sha256', pepper).update(code).digest('hex');
}

const app = Fastify({
  logger: true,
  bodyLimit: 1_000_000,
});

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

app.setErrorHandler((err, _req, reply) => {
  if (reply.sent) return;
  const statusCode = (err as any)?.statusCode;
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    return reply.code(statusCode).send({ error: (err as any)?.message ?? 'Error' });
  }
  return reply.code(500).send({ error: 'Internal Server Error' });
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: '1 minute',
});

app.addHook('preHandler', async (req: FastifyRequest) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return;
  try {
    const claims = verifyToken(token);
    // Hydrate from DB so role/username reflect current state (not stale JWT).
    try {
      const dbUser = await prisma.appUser.findUnique({ where: { id: claims.sub } });
      if (!dbUser || dbUser.is_active === false) return;
      req.user = {
        ...claims,
        username: dbUser.username,
        role: dbUser.role,
      };
    } catch {
      // If DB lookup fails, fall back to raw claims.
      req.user = claims;
    }
  } catch {
    // ignore invalid token; handlers can enforce auth
  }
});

app.get('/health', async () => ({ ok: true, time: nowIso() }));

// =========================
// Auth + OTP
// =========================

app.post('/auth/request-otp', async (req: FastifyRequest, reply: FastifyReply) => {
  const body = (req.body ?? {}) as any;
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username || !password) return reply.code(400).send({ error: 'username and password are required' });

  const user = await prisma.appUser.findUnique({ where: { username } });
  if (!user || user.is_active === false) return reply.code(401).send({ error: 'Giriş başarısız' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return reply.code(401).send({ error: 'Kullanıcı adı veya parola hatalı' });

  // If OTP is disabled for this user, allow direct login.
  if (user.otp_required === false) {
    // note: still returning a token to secure subsequent API calls
    const { signToken } = await import('./auth');
    const token = signToken({ sub: user.id, username: user.username, role: user.role });
    await prisma.appUser.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    return reply.send({ bypassOtp: true, token, user: sanitizeUser(user) });
  }

  const email = (user.email ?? '').trim();
  if (!email) return reply.code(400).send({ error: 'Bu kullanıcı için e-posta tanımlı değil. Yönetici panelinden e-posta ekleyin.' });

  const code = randomOtpCode();
  const challengeId = crypto.randomUUID();
  const ttlSeconds = Number(process.env.OTP_TTL_SECONDS ?? 600);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.loginOtpChallenge.create({
    data: {
      id: challengeId,
      user_id: user.id,
      email,
      code_hash: hashOtp(code),
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
      created_at: new Date(),
    },
  });

  try {
    await sendOtpEmail({ to: email, code });
  } catch (e) {
    req.log.error({ err: e }, 'Failed to send OTP email');
    return reply.code(500).send({ error: 'OTP e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.' });
  }

  return reply.send({
    challengeId,
    emailMasked: maskEmail(email),
  });
});

app.post('/auth/verify-otp', async (req: FastifyRequest, reply: FastifyReply) => {
  const body = (req.body ?? {}) as any;
  const challengeId = String(body.challengeId ?? '').trim();
  const code = String(body.code ?? '').trim();
  if (!challengeId || !code) return reply.code(400).send({ error: 'challengeId and code are required' });
  if (!/^\d{6}$/.test(code)) return reply.code(400).send({ error: 'Kod 6 haneli olmalıdır' });

  const ch = await prisma.loginOtpChallenge.findUnique({ where: { id: challengeId } });
  if (!ch) return reply.code(401).send({ error: 'Kod hatalı veya süresi doldu' });
  if (ch.consumed_at) return reply.code(401).send({ error: 'Kod hatalı veya süresi doldu' });
  if (new Date(ch.expires_at).getTime() < Date.now()) return reply.code(401).send({ error: 'Kod hatalı veya süresi doldu' });
  if ((ch.attempts ?? 0) >= 8) return reply.code(429).send({ error: 'Çok fazla deneme. Lütfen tekrar giriş yapın.' });

  const nextAttempts = (ch.attempts ?? 0) + 1;
  const matches = hashOtp(code) === ch.code_hash;
  if (!matches) {
    await prisma.loginOtpChallenge.update({ where: { id: ch.id }, data: { attempts: nextAttempts } });
    return reply.code(401).send({ error: 'Kod doğrulanamadı' });
  }

  const user = await prisma.appUser.findUnique({ where: { id: ch.user_id } });
  if (!user || user.is_active === false) return reply.code(401).send({ error: 'Giriş başarısız' });

  await prisma.loginOtpChallenge.update({ where: { id: ch.id }, data: { consumed_at: new Date(), attempts: nextAttempts } });
  await prisma.appUser.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

  const { signToken } = await import('./auth');
  const token = signToken({ sub: user.id, username: user.username, role: user.role });

  return reply.send({ token, user: sanitizeUser(user) });
});

app.post('/auth/register', async (req: FastifyRequest, reply: FastifyReply) => {
  const body = (req.body ?? {}) as any;
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const fullName = body.fullName != null ? String(body.fullName).trim() : '';
  const email = body.email != null ? String(body.email).trim() : '';

  if (username.length < 3) return reply.code(400).send({ error: 'Kullanıcı adı en az 3 karakter olmalıdır' });
  if (password.length < 6) return reply.code(400).send({ error: 'Parola en az 6 karakter olmalıdır' });

  const existing = await prisma.appUser.findUnique({ where: { username } });
  if (existing) return reply.code(409).send({ error: 'Bu kullanıcı adı zaten kullanılıyor' });

  const id = crypto.randomUUID();
  const password_hash = await bcrypt.hash(password, 10);

  const user = await prisma.appUser.create({
    data: {
      id,
      username,
      password_hash,
      role: 'user',
      full_name: fullName || null,
      email: email || null,
      phone: null,
      is_active: true,
      otp_required: true,
      created_at: new Date(),
      last_login_at: null,
      can_view: false,
      can_edit: false,
      can_create: false,
      can_delete: false,
      can_export: false,
      can_route: false,
      can_team_view: false,
      can_manual_gps: false,
    },
  });

  return reply.send({ success: true, userId: user.id });
});

function requireAuth(req: any, _reply: any): ReqUser {
  const u = req.user;
  if (!u?.sub) throw new HttpError(401, 'Unauthorized');
  return u;
}

function requireAdmin(req: any, reply: any): ReqUser {
  const u = requireAuth(req, reply);
  if (String(u.role).toLowerCase() !== 'admin') throw new HttpError(403, 'Forbidden');
  return u;
}

function sanitizeUser(u: any) {
  return {
    id: String(u.id),
    username: String(u.username),
    role: String(u.role ?? 'user'),
    full_name: u.full_name ?? null,
    email: u.email ?? null,
    phone: u.phone ?? null,
    is_active: u.is_active ?? true,
    otp_required: u.otp_required ?? true,
    created_at: toIso(u.created_at),
    last_login_at: toIso(u.last_login_at),
    can_view: u.can_view ?? null,
    can_edit: u.can_edit ?? null,
    can_create: u.can_create ?? null,
    can_delete: u.can_delete ?? null,
    can_export: u.can_export ?? null,
    can_route: u.can_route ?? null,
    can_team_view: u.can_team_view ?? null,
    can_manual_gps: u.can_manual_gps ?? null,
  };
}

const PERMISSION_KEYS = [
  'can_view',
  'can_edit',
  'can_create',
  'can_delete',
  'can_export',
  'can_route',
  'can_team_view',
  'can_manual_gps',
] as const;

function isAdminRole(role: any): boolean {
  return String(role ?? '').trim().toLowerCase() === 'admin';
}

function adminPermissionsPatch(): Record<(typeof PERMISSION_KEYS)[number], boolean> {
  return {
    can_view: true,
    can_edit: true,
    can_create: true,
    can_delete: true,
    can_export: true,
    can_route: true,
    can_team_view: true,
    can_manual_gps: true,
  };
}

function toIso(d: any): string | null {
  if (!d) return null;
  try {
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
  } catch {
    return null;
  }
}

// =========================
// Users (admin)
// =========================

app.get('/admin/users', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const users = await prisma.appUser.findMany({ orderBy: { created_at: 'desc' } });
  return reply.send({ users: users.map(sanitizeUser) });
});

app.post('/admin/users', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const body = (req.body ?? {}) as any;
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const role = String(body.role ?? 'user').trim() || 'user';
  const email = body.email != null ? String(body.email).trim() : '';
  const fullName = body.full_name != null ? String(body.full_name).trim() : '';
  const phone = body.phone != null ? String(body.phone).trim() : '';

  if (username.length < 3) return reply.code(400).send({ error: 'Kullanıcı adı en az 3 karakter olmalıdır' });
  if (password.length < 6) return reply.code(400).send({ error: 'Parola en az 6 karakter olmalıdır' });

  const existing = await prisma.appUser.findUnique({ where: { username } });
  if (existing) return reply.code(409).send({ error: 'Bu kullanıcı adı zaten kullanılıyor' });

  const id = crypto.randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  const isAdmin = isAdminRole(role);
  const user = await prisma.appUser.create({
    data: {
      id,
      username,
      password_hash,
      role,
      email: email || null,
      full_name: fullName || null,
      phone: phone || null,
      is_active: true,
      otp_required: true,
      created_at: new Date(),
      last_login_at: null,
      ...(isAdmin ? adminPermissionsPatch() : {
        can_view: false,
        can_edit: false,
        can_create: false,
        can_delete: false,
        can_export: false,
        can_route: false,
        can_team_view: false,
        can_manual_gps: false,
      }),
    },
  });

  return reply.send({ success: true, user_id: user.id });
});

app.patch('/admin/users/:id', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const userId = String((req.params as any)?.id ?? '').trim();
  const body = (req.body ?? {}) as any;

  const existing = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!existing) return reply.code(404).send({ error: 'Kullanıcı bulunamadı' });

  const patch: any = {};
  if (body.username != null && String(body.username).trim()) patch.username = String(body.username).trim();
  if (body.role != null && String(body.role).trim()) patch.role = String(body.role).trim();
  if (body.email != null) patch.email = String(body.email).trim() || null;
  if (body.full_name != null) patch.full_name = String(body.full_name).trim() || null;
  if (body.phone != null) patch.phone = String(body.phone).trim() || null;
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (typeof body.otp_required === 'boolean') patch.otp_required = body.otp_required;
  if (body.password != null && String(body.password).length > 0) {
    patch.password_hash = await bcrypt.hash(String(body.password), 10);
  }

  const nextRole = patch.role ?? existing.role;
  if (isAdminRole(nextRole)) {
    if (patch.role != null) patch.role = 'admin';
    Object.assign(patch, adminPermissionsPatch());
  }

  const user = await prisma.appUser.update({ where: { id: userId }, data: patch });
  return reply.send({ success: true, user: sanitizeUser(user) });
});

app.patch('/admin/users/:id/permissions', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const userId = String((req.params as any)?.id ?? '').trim();
  const body = (req.body ?? {}) as any;

  const existing = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!existing) return reply.code(404).send({ error: 'Kullanıcı bulunamadı' });

  const patch: any = {};
  for (const k of PERMISSION_KEYS) {
    if (typeof body[k] === 'boolean') patch[k] = body[k];
  }

  if (isAdminRole(existing.role)) {
    Object.assign(patch, adminPermissionsPatch());
  }

  const user = await prisma.appUser.update({ where: { id: userId }, data: patch });
  return reply.send({ success: true, user: sanitizeUser(user) });
});

app.delete('/admin/users/:id', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const userId = String((req.params as any)?.id ?? '').trim();
  try {
    await prisma.appUser.delete({ where: { id: userId } });
    return reply.send({ success: true });
  } catch {
    return reply.code(404).send({ error: 'Kullanıcı bulunamadı' });
  }
});

// =========================
// Locations
// =========================

app.get('/locations', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const q = (req.query ?? {}) as any;
  const regionId = q.region_id != null ? Number(q.region_id) : null;
  const projectId = q.project_id != null ? String(q.project_id) : null;

  const where: any = {};
  if (Number.isFinite(regionId) && regionId! > 0) where.region_id = regionId;
  if (projectId && projectId.trim()) where.project_id = projectId.trim();

  const rows = await prisma.location.findMany({
    where,
    orderBy: [{ region_id: 'asc' }, { name: 'asc' }],
  });

  return reply.send({ data: rows });
});

app.get('/locations/:id', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const id = String((req.params as any)?.id ?? '').trim();
  if (!id) return reply.code(400).send({ error: 'id is required' });
  const row = await prisma.location.findUnique({ where: { id } });
  if (!row) return reply.code(404).send({ error: 'Lokasyon bulunamadı' });
  return reply.send({ data: row });
});

// =========================
// Work entries (Mesai)
// =========================

app.post('/work-entries', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const userId = String(body.user_id ?? '').trim() || u.sub;
  const username = String(body.username ?? '').trim() || u.username;
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const arrivedAt = body.arrived_at ? new Date(body.arrived_at) : null;
  const completedAt = body.completed_at ? new Date(body.completed_at) : null;
  const departedAt = body.departed_at ? new Date(body.departed_at) : null;
  if (!arrivedAt || !Number.isFinite(arrivedAt.getTime())) return reply.code(400).send({ error: 'arrived_at is required' });
  if (!completedAt || !Number.isFinite(completedAt.getTime())) return reply.code(400).send({ error: 'completed_at is required' });
  if (departedAt && !Number.isFinite(departedAt.getTime())) return reply.code(400).send({ error: 'departed_at is invalid' });

  const travelMinutes = body.travel_minutes != null ? Number(body.travel_minutes) : 0;
  const workMinutes = body.work_minutes != null ? Number(body.work_minutes) : 0;

  const row = await prisma.workEntry.create({
    data: {
      user_id: userId,
      username,
      location_id: body.location_id != null ? String(body.location_id) : null,
      location_name: body.location_name != null ? String(body.location_name) : null,
      departed_at: departedAt,
      arrived_at: arrivedAt,
      completed_at: completedAt,
      travel_minutes: Number.isFinite(travelMinutes) ? Math.max(0, Math.floor(travelMinutes)) : 0,
      work_minutes: Number.isFinite(workMinutes) ? Math.max(0, Math.floor(workMinutes)) : 0,
    },
  });

  return reply.send({ success: true, data: { id: row.id } });
});

app.get('/work-entries', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const q = (req.query ?? {}) as any;
  const startIso = String(q.startIso ?? '').trim();
  const endIso = String(q.endIso ?? '').trim();
  const limit = Math.max(1, Math.min(50_000, Number(q.limit ?? 5000)));

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!startIso || !Number.isFinite(start.getTime())) return reply.code(400).send({ error: 'startIso is required' });
  if (!endIso || !Number.isFinite(end.getTime())) return reply.code(400).send({ error: 'endIso is required' });

  const rows = await prisma.workEntry.findMany({
    where: {
      completed_at: {
        gte: start,
        lte: end,
      },
    },
    orderBy: [{ completed_at: 'desc' }],
    take: limit,
  });

  const out = rows.map((r: any) => ({
    id: String(r.id),
    user_id: r.user_id,
    username: r.username,
    location_id: r.location_id ?? null,
    location_name: r.location_name ?? null,
    departed_at: toIso(r.departed_at),
    arrived_at: toIso(r.arrived_at)!,
    completed_at: toIso(r.completed_at)!,
    travel_minutes: r.travel_minutes ?? 0,
    work_minutes: r.work_minutes ?? 0,
    created_at: toIso(r.created_at)!,
  }));

  return reply.send({ data: out });
});

app.post('/locations/seed-if-empty', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return reply.send({ inserted: 0 });

  const count = await prisma.location.count();
  if (count > 0) return reply.send({ inserted: 0, skipped: true });

  const result = await prisma.location.createMany({ data: rows, skipDuplicates: true });
  return reply.send({ inserted: result.count });
});

app.put('/locations/:id', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const id = String((req.params as any)?.id ?? '').trim();
  const body = (req.body ?? {}) as any;
  try {
    const updated = await prisma.location.update({ where: { id }, data: body });
    return reply.send({ success: true, data: updated });
  } catch {
    return reply.code(404).send({ error: 'Lokasyon bulunamadı' });
  }
});

app.post('/locations', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  if (!body?.id) return reply.code(400).send({ error: 'id is required' });
  try {
    const created = await prisma.location.create({ data: body });
    return reply.send({ success: true, data: created });
  } catch (e: any) {
    return reply.code(400).send({ error: e?.message ?? 'Lokasyon oluşturulamadı' });
  }
});

app.delete('/locations/:id', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const id = String((req.params as any)?.id ?? '').trim();
  try {
    await prisma.location.delete({ where: { id } });
    return reply.send({ success: true });
  } catch {
    return reply.code(404).send({ error: 'Lokasyon bulunamadı' });
  }
});

// =========================
// Tasks
// =========================

app.get('/tasks', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const q = (req.query ?? {}) as any;
  const assignedTo = q.assigned_to_user_id != null ? String(q.assigned_to_user_id) : null;
  const createdBy = q.created_by_user_id != null ? String(q.created_by_user_id) : null;

  // Non-admins can only query their own tasks
  if (String(u.role).toLowerCase() !== 'admin') {
    if (assignedTo && assignedTo !== u.sub) return reply.code(403).send({ error: 'Forbidden' });
    if (createdBy && createdBy !== u.sub) return reply.code(403).send({ error: 'Forbidden' });
  }

  const where: any = {};
  if (assignedTo) where.assigned_to_user_id = assignedTo;
  if (createdBy) where.created_by_user_id = createdBy;

  const rows = await prisma.task.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 500,
  });

  return reply.send({ data: rows });
});

app.get('/tasks/active', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const q = (req.query ?? {}) as any;
  const userIdsRaw = String(q.user_ids ?? '').trim();
  if (!userIdsRaw) return reply.send({ data: [] });

  const userIds = userIdsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  if (userIds.length === 0) return reply.send({ data: [] });

  const rows = await prisma.task.findMany({
    where: {
      assigned_to_user_id: { in: userIds },
      status: { in: ['assigned', 'in_progress'] },
    },
    orderBy: { created_at: 'desc' },
    take: 500,
  });

  return reply.send({ data: rows });
});

app.post('/tasks', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAdmin(req, reply);
  const body = (req.body ?? {}) as any;
  const id = crypto.randomUUID();
  const now = new Date();

  const row = await prisma.task.create({
    data: {
      id,
      title: String(body.title ?? ''),
      description: body.description != null ? String(body.description) : null,
      created_at: now,
      created_by_user_id: u.sub,
      created_by_username: u.username,
      assigned_to_user_id: String(body.assigned_to_user_id ?? ''),
      assigned_to_username: body.assigned_to_username != null ? String(body.assigned_to_username) : null,
      region_id: body.region_id != null ? Number(body.region_id) : null,
      region_name: body.region_name != null ? String(body.region_name) : null,
      route_location_ids: Array.isArray(body.route_location_ids) ? body.route_location_ids : [],
      status: 'assigned',
      started_at: null,
      completed_at: null,
      cancelled_at: null,
    },
  });

  return reply.send({ success: true, data: row });
});

app.patch('/tasks/:id/status', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const id = String((req.params as any)?.id ?? '').trim();
  const body = (req.body ?? {}) as any;
  const status = String(body.status ?? '').trim();
  if (!status) return reply.code(400).send({ error: 'status is required' });

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return reply.code(404).send({ error: 'Görev bulunamadı' });
  if (String(u.role).toLowerCase() !== 'admin' && task.assigned_to_user_id !== u.sub) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const patch: any = { status };
  const now = new Date();
  if (status === 'assigned') {
    patch.started_at = null;
    patch.completed_at = null;
    patch.cancelled_at = null;
  }
  if (status === 'in_progress') patch.started_at = now;
  if (status === 'completed') patch.completed_at = now;
  if (status === 'cancelled') patch.cancelled_at = now;

  const updated = await prisma.task.update({ where: { id }, data: patch });
  return reply.send({ success: true, data: updated });
});

// =========================
// Messages
// =========================

app.get('/users/active', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const users = await prisma.appUser.findMany({ orderBy: { created_at: 'asc' } });
  const active = users.filter((u: any) => u.is_active !== false).map((u: any) => ({
    id: String(u.id),
    username: String(u.username),
    role: String(u.role ?? 'user'),
    full_name: u.full_name ?? null,
    is_active: u.is_active,
  }));
  return reply.send({ data: active });
});

app.get('/messages/admin/unread-counts', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const rows = await prisma.appMessage.findMany({
    where: { is_read: false },
    select: { user_id: true, sender_user_id: true },
    take: 50_000,
  });

  const counts: Record<string, number> = {};
  for (const r of rows as any[]) {
    const userId = String(r.user_id);
    const senderId = String(r.sender_user_id);
    // Admin inbox: count only user->admin messages (sender == user)
    if (senderId === userId) {
      counts[userId] = (counts[userId] ?? 0) + 1;
    }
  }

  return reply.send({ data: counts });
});

app.get('/messages/unread-count', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const userId = String(u.sub);

  const count = await prisma.appMessage.count({
    where: {
      user_id: userId,
      is_read: false,
      // For a normal user, unread means: messages sent by admins/others.
      NOT: { sender_user_id: userId },
    },
  });

  return reply.send({ data: count });
});

app.get('/messages/thread/:userId', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const userId = String((req.params as any)?.userId ?? '').trim();
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const rows = await prisma.appMessage.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'asc' },
    take: 5000,
  });

  // Attach sender info (best-effort)
  const senderIds = Array.from(new Set(rows.map((r: any) => r.sender_user_id)));
  const senders = await prisma.appUser.findMany({ where: { id: { in: senderIds } } });
  const senderMap = new Map<string, any>(senders.map((s: any) => [String(s.id), s] as const));

  const out = rows.map((r: any) => ({
    id: r.id,
    created_at: r.created_at.toISOString(),
    user_id: r.user_id,
    sender_user_id: r.sender_user_id,
    body: r.body,
    is_read: r.is_read,
    read_at: r.read_at ? r.read_at.toISOString() : null,
    sender: (() => {
      const s = senderMap.get(String(r.sender_user_id));
      return s ? { id: s.id, username: s.username, role: s.role, full_name: s.full_name ?? null, is_active: s.is_active } : null;
    })(),
  }));

  return reply.send({ data: out });
});

app.post('/messages/thread/:userId', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const userId = String((req.params as any)?.userId ?? '').trim();
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const body = (req.body ?? {}) as any;
  const msg = String(body.body ?? '').trim();
  if (!msg) return reply.send({ success: true });

  const row = await prisma.appMessage.create({
    data: {
      user_id: userId,
      sender_user_id: u.sub,
      body: msg,
      is_read: false,
      read_at: null,
      created_at: new Date(),
    },
  });
  return reply.send({ success: true, id: row.id });
});

app.post('/messages/broadcast', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAdmin(req, reply);
  const body = (req.body ?? {}) as any;
  const msg = String(body.body ?? '').trim();
  const includeAdmins = !!body.includeAdmins;
  if (!msg) return reply.send({ sent: 0 });

  const users = await prisma.appUser.findMany({});
  const targets = users
    .filter((x: any) => x.is_active !== false)
    .filter((x: any) => x.id !== u.sub)
    .filter((x: any) => includeAdmins ? true : String(x.role).toLowerCase() !== 'admin');

  const rows = targets.map((t: any) => ({
    user_id: t.id,
    sender_user_id: u.sub,
    body: msg,
    is_read: false,
    read_at: null,
    created_at: new Date(),
  }));

  if (rows.length === 0) return reply.send({ sent: 0 });
  const result = await prisma.appMessage.createMany({ data: rows });
  return reply.send({ sent: result.count });
});

app.post('/messages/thread/:userId/mark-read', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const userId = String((req.params as any)?.userId ?? '').trim();
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const rows = await prisma.appMessage.findMany({ where: { user_id: userId, is_read: false } });
  if (rows.length === 0) return reply.send({ success: true });

  const isReaderThreadOwner = userId === u.sub;
  const idsToMark = rows
    .filter((r: any) => {
      const senderId = String(r.sender_user_id);
      const threadUserId = String(r.user_id);
      return isReaderThreadOwner ? senderId !== threadUserId : senderId === threadUserId;
    })
    .map((r: any) => r.id);

  if (idsToMark.length === 0) return reply.send({ success: true });

  await prisma.appMessage.updateMany({
    where: { id: { in: idsToMark } },
    data: { is_read: true, read_at: new Date() },
  });

  return reply.send({ success: true });
});

// =========================
// Team status
// =========================

app.get('/team-status', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const rows = await prisma.teamStatus.findMany({
    orderBy: [{ status: 'asc' }, { last_updated_at: 'desc' }],
  });
  // Also fetch user full names
  const userIds = rows.map(r => r.user_id);
  const users = await prisma.appUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, full_name: true },
  });
  const userNameMap = new Map(users.map((u: { id: string; full_name: string | null }) => [u.id, u.full_name]));
  
  // Return snake_case payload for legacy client compatibility
  const out = rows.map((r: any) => ({
    user_id: r.user_id,
    username: r.username,
    full_name: userNameMap.get(r.user_id) ?? null,
    status: r.status,
    current_location_id: r.current_location_id,
    current_location_name: r.current_location_name,
    next_location_name: r.next_location_name,
    total_route_count: r.total_route_count,
    completed_count: r.completed_count,
    current_lat: r.current_lat,
    current_lng: r.current_lng,
    last_updated_at: r.last_updated_at.toISOString(),
    updated_at: r.last_updated_at.toISOString(),
    route_started_at: toIso(r.route_started_at),
    completed_locations: r.completed_locations ?? null,
    current_leg_start_time: toIso(r.current_leg_start_time),
    total_travel_minutes: r.total_travel_minutes ?? 0,
    total_work_minutes: r.total_work_minutes ?? 0,
    today_completed_count: r.today_completed_count ?? 0,
    today_started_at: toIso(r.today_started_at),
    is_working: r.is_working,
    work_start_time: toIso(r.work_start_time),
    active_route: r.active_route ?? null,
    current_route_index: r.current_route_index ?? 0,
  }));
  return reply.send({ data: out });
});

app.post('/team-status/update', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const userId = String(body.userId ?? '').trim() || u.sub;
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const data: any = {
    user_id: userId,
    username: String(body.username ?? u.username),
    status: String(body.status ?? 'idle'),
    current_location_id: body.currentLocationId != null ? String(body.currentLocationId) : null,
    current_location_name: body.currentLocationName != null ? String(body.currentLocationName) : null,
    next_location_name: body.nextLocationName != null ? String(body.nextLocationName) : null,
    total_route_count: body.totalRouteCount != null ? Number(body.totalRouteCount) : 0,
    completed_count: body.completedCount != null ? Number(body.completedCount) : 0,
    current_lat: body.currentLat != null ? Number(body.currentLat) : null,
    current_lng: body.currentLng != null ? Number(body.currentLng) : null,
    active_route: body.activeRoute ?? null,
    current_route_index: body.currentRouteIndex != null ? Number(body.currentRouteIndex) : 0,
    is_working: body.isWorking != null ? !!body.isWorking : false,
    work_start_time: body.workStartTime ? new Date(body.workStartTime) : null,
    completed_locations: body.completedLocations ?? null,
    current_leg_start_time: body.currentLegStartTime ? new Date(body.currentLegStartTime) : null,
    total_travel_minutes: body.totalTravelMinutes != null ? Number(body.totalTravelMinutes) : null,
    total_work_minutes: body.totalWorkMinutes != null ? Number(body.totalWorkMinutes) : null,
    today_completed_count: body.todayCompletedCount != null ? Number(body.todayCompletedCount) : null,
    last_updated_at: new Date(),
    today_started_at: body.todayStartedAt ? new Date(body.todayStartedAt) : null,
    route_started_at: body.routeStartedAt ? new Date(body.routeStartedAt) : null,
  };

  await prisma.teamStatus.upsert({
    where: { user_id: userId },
    create: data,
    update: data,
  });

  return reply.send({ success: true });
});

app.get('/team-status/route/:userId', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const userId = String((req.params as any)?.userId ?? '').trim();
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const row = await prisma.teamStatus.findUnique({ where: { user_id: userId } });
  if (!row) return reply.send({ success: true, data: null });

  return reply.send({
    success: true,
    data: {
      active_route: row.active_route ?? null,
      current_route_index: row.current_route_index ?? 0,
      is_working: row.is_working ?? false,
      work_start_time: toIso(row.work_start_time),
      status: row.status ?? 'idle',
      completed_locations: row.completed_locations ?? [],
      current_leg_start_time: toIso(row.current_leg_start_time),
      total_travel_minutes: row.total_travel_minutes ?? 0,
      total_work_minutes: row.total_work_minutes ?? 0,
      today_completed_count: row.today_completed_count ?? 0,
      today_started_at: toIso(row.today_started_at),
      route_started_at: toIso(row.route_started_at),
    },
  });
});

app.post('/team-status/clear', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const userId = String(body.userId ?? '').trim() || u.sub;
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  await prisma.teamStatus.updateMany({
    where: { user_id: userId },
    data: {
      status: 'idle',
      current_location_id: null,
      current_location_name: null,
      next_location_name: null,
      total_route_count: 0,
      completed_count: 0,
      active_route: Prisma.DbNull,
      current_route_index: 0,
      is_working: false,
      work_start_time: null,
      current_leg_start_time: null,
      route_started_at: null,
      last_updated_at: new Date(),
    },
  });

  return reply.send({ success: true });
});

app.post('/team-status/reset-daily', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const userId = String(body.userId ?? '').trim() || u.sub;
  const isAdmin = String(u.role).toLowerCase() === 'admin';
  if (!isAdmin && userId !== u.sub) return reply.code(403).send({ error: 'Forbidden' });

  const now = new Date();

  await prisma.teamStatus.updateMany({
    where: { user_id: userId },
    data: {
      today_completed_count: 0,
      today_started_at: now,
      total_travel_minutes: 0,
      total_work_minutes: 0,
      last_updated_at: now,
    },
  });

  return reply.send({ success: true });
});

// =========================
// Activities
// =========================

app.post('/activities', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const row = await prisma.activity.create({
    data: {
      username: String(body.username ?? ''),
      action: String(body.action ?? ''),
      location_id: body.location_id != null ? String(body.location_id) : null,
      location_name: body.location_name != null ? String(body.location_name) : null,
      arrival_time: body.arrival_time ? new Date(body.arrival_time) : null,
      completion_time: body.completion_time ? new Date(body.completion_time) : null,
      duration_minutes: body.duration_minutes != null ? Number(body.duration_minutes) : null,
      activity_type: String(body.activity_type ?? 'general'),
      created_at: new Date(),
    },
  });
  return reply.send({ data: { ...row, created_at: row.created_at.toISOString() } });
});

app.get('/activities', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const q = (req.query ?? {}) as any;
  const limit = q.limit != null ? Number(q.limit) : 200;
  const locationId = q.location_id != null ? String(q.location_id) : null;
  const where: any = {};
  if (locationId) where.location_id = locationId;
  const rows = await prisma.activity.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: Math.min(2000, Math.max(1, limit)),
  });
  const out = rows.map((r: any) => ({
    ...r,
    created_at: r.created_at.toISOString(),
    arrival_time: toIso(r.arrival_time),
    completion_time: toIso(r.completion_time),
  }));
  return reply.send({ data: out });
});

// =========================
// Work entries
// =========================

// =========================
// Acceptance requests
// =========================

app.get('/acceptance-requests/pending', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAdmin(req, reply);
  const rows = await prisma.locationAcceptanceRequest.findMany({
    where: { status: 'pending' },
    orderBy: { created_at: 'desc' },
    take: 200,
  });
  const out = rows.map((r: any) => ({
    id: Number(r.id),
    location_id: String(r.location_id),
    location_name: String(r.location_name),
    requested_by_user_id: String(r.requested_by_user_id),
    requested_by_username: String(r.requested_by_username),
    status: String(r.status),
    created_at: r.created_at.toISOString(),
    reviewed_at: toIso(r.reviewed_at),
    reviewed_by_user_id: r.reviewed_by_user_id ? String(r.reviewed_by_user_id) : null,
    reviewed_by_username: r.reviewed_by_username ? String(r.reviewed_by_username) : null,
  }));
  return reply.send({ data: out });
});

app.post('/acceptance-requests', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const body = (req.body ?? {}) as any;
  const locationId = String(body.locationId ?? body.location_id ?? '').trim();
  if (!locationId) return reply.code(400).send({ error: 'locationId is required' });

  const existing = await prisma.locationAcceptanceRequest.findFirst({
    where: { location_id: locationId, status: 'pending' },
    select: { id: true },
  });
  if (existing) return reply.send({ success: true, alreadyPending: true });

  await prisma.locationAcceptanceRequest.create({
    data: {
      location_id: locationId,
      location_name: String(body.locationName ?? body.location_name ?? ''),
      requested_by_user_id: String(body.requestedByUserId ?? u.sub),
      requested_by_username: String(body.requestedByUsername ?? u.username),
      status: 'pending',
      created_at: new Date(),
      reviewed_at: null,
      reviewed_by_user_id: null,
      reviewed_by_username: null,
    },
  });

  return reply.send({ success: true });
});

app.post('/acceptance-requests/:id/approve', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAdmin(req, reply);
  const id = Number((req.params as any)?.id);
  const now = new Date();
  await prisma.locationAcceptanceRequest.update({
    where: { id },
    data: {
      status: 'approved',
      reviewed_at: now,
      reviewed_by_user_id: u.sub,
      reviewed_by_username: u.username,
    },
  });
  return reply.send({ success: true });
});

app.post('/acceptance-requests/:id/reject', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAdmin(req, reply);
  const id = Number((req.params as any)?.id);
  const now = new Date();
  await prisma.locationAcceptanceRequest.update({
    where: { id },
    data: {
      status: 'rejected',
      reviewed_at: now,
      reviewed_by_user_id: u.sub,
      reviewed_by_username: u.username,
    },
  });
  return reply.send({ success: true });
});

// =========================
// App version
// =========================

app.get('/app-version/latest', async (req: FastifyRequest, reply: FastifyReply) => {
  requireAuth(req, reply);
  const q = (req.query ?? {}) as any;
  const platform = q.platform != null ? String(q.platform) : null;

  let row: any = null;
  if (platform) {
    row = await prisma.appVersion.findFirst({ where: { platform }, orderBy: { version_code: 'desc' } });
    // If platform is explicitly requested and we have no row for it,
    // do NOT fall back to another platform's version.
    if (!row) return reply.send({ data: null });
  }
  if (!row) {
    row = await prisma.appVersion.findFirst({ orderBy: { version_code: 'desc' } });
  }
  if (!row) return reply.send({ data: null });

  return reply.send({
    data: {
      version_code: row.version_code,
      version_name: row.version_name,
      platform: row.platform,
      store_url: row.store_url,
      apk_url: row.apk_url,
      release_notes: row.release_notes,
      is_mandatory: row.is_mandatory,
    },
  });
});

// =========================
// Minimal endpoints to unblock frontend migration
// (We will expand these in follow-up patches)
// =========================

app.get('/me', async (req: FastifyRequest, reply: FastifyReply) => {
  const u = requireAuth(req, reply);
  const user = await prisma.appUser.findUnique({ where: { id: u.sub } });
  if (!user) return reply.code(401).send({ error: 'Unauthorized' });
  return reply.send({ user: sanitizeUser(user) });
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

async function ensureAdminPermissionsOnBoot() {
  try {
    const res = await prisma.appUser.updateMany({
      where: { role: { in: ['admin', 'Admin', 'ADMIN'] } },
      data: adminPermissionsPatch(),
    });
    if (res.count > 0) {
      console.log(`[boot] normalized admin permissions for ${res.count} user(s)`);
    }
  } catch (e) {
    console.error('[boot] failed to normalize admin permissions', e);
  }
}

await ensureAdminPermissionsOnBoot();

// If the frontend has been built (dist/ exists), serve it from the API.
// This avoids exposing the Vite dev server (5173) in production.
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
  });

  // SPA fallback: only for browser navigations. Keep API 404s as JSON.
  app.setNotFoundHandler((req, reply) => {
    const method = String(req.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return reply.code(404).send({ error: 'Not Found' });
    }

    const accept = String(req.headers.accept ?? '');
    const wantsHtml = accept.includes('text/html') || accept.includes('*/*');
    if (!wantsHtml) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    // fastify-static's sendFile already writes the response.
    // Calling reply.send(sendFile(...)) will attempt to send the return value (an object),
    // which triggers: "Attempted to send payload of invalid type 'object'. Expected a string or Buffer."
    return (reply as any).sendFile('index.html');
  });
}

await app.listen({ port, host });

process.on('SIGINT', async () => {
  try { await prisma.$disconnect(); } catch { /* ignore */ }
  process.exit(0);
});
