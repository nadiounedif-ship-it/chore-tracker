import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // Check cookie or Authorization Bearer header
  const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/, '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
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
