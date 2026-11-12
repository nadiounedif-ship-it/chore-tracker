import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma.js';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  sid?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  // Check cookie or Authorization Bearer header
  const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/, '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    if (payload.sid) {
      const session = await prisma.authSession.findUnique({ where: { id: payload.sid }, include: { user: { select: { status: true } } } });
      const now = Date.now();
      if (!session || session.expiresAt.getTime() <= now || session.lastActivityAt.getTime() <= now - 7 * 24 * 60 * 60 * 1000 || session.user.status !== 'ACTIVE') {
        if (session) await prisma.authSession.deleteMany({ where: { id: payload.sid } });
        return res.status(401).json({ error: 'Your session expired after seven days without activity. Please log in again.' });
      }
      if (session.lastActivityAt.getTime() < now - 5 * 60 * 1000) {
        await prisma.authSession.update({ where: { id: payload.sid }, data: { lastActivityAt: new Date(now), expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000) } });
        const refreshed = jwt.sign({ id: payload.id, email: payload.email, username: payload.username, role: payload.role, sid: payload.sid }, config.jwtSecret, { expiresIn: '30d' });
        res.cookie('token', refreshed, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: config.nodeEnv === 'production' ? 'none' : 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
      }
    }
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Requires role: ${allowedRoles.join(' or ')}.` 
      });
    }

    next();
  };
}
