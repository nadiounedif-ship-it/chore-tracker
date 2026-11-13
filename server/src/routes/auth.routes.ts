import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

export const authRouter = Router();

// Validation Schemas
const RegisterBossSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric or underscore'),
  fullName: z.string().min(2).max(100),
  password: z.string().min(6),
  avatarUrl: z.string().optional(),
  teamName: z.string().min(2).max(100),
  teamDescription: z.string().optional(),
});

const RegisterWorkerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric or underscore'),
  fullName: z.string().min(2).max(100),
  password: z.string().min(6),
  avatarUrl: z.string().optional(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid date of birth is required for worker accounts',
  }),
});

const LoginSchema = z.object({
  identifier: z.string().min(1), // email or username
  password: z.string().min(1),
});

/**
 * Helper to generate JWT and set secure cookie
 */
async function createAuthSession(res: Response, user: { id: string; email: string; username: string; role: 'BOSS' | 'WORKER' }): Promise<void> {
  const session = await prisma.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      sid: session.id,
    },
    config.jwtSecret,
    { expiresIn: '30d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

}

/**
 * POST /api/auth/register-boss
 */
authRouter.post('/register-boss', async (req: Request, res: Response) => {
  try {
    const data = RegisterBossSchema.parse(req.body);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already in use.' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    // Transaction: Create Boss User + Exactly One Team + Default Salary Brackets
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          username: data.username,
          fullName: data.fullName,
          passwordHash,
          avatarUrl: data.avatarUrl || null,
          role: 'BOSS',
        },
      });

      const team = await tx.team.create({
        data: {
          name: data.teamName,
          description: data.teamDescription || null,
          bossId: user.id,
          salaryBrackets: {
            create: [
              { minAge: 13, maxAge: 13, hourlyRate: new Prisma.Decimal('3.00') },
              { minAge: 14, maxAge: 14, hourlyRate: new Prisma.Decimal('3.50') },
              { minAge: 15, maxAge: 15, hourlyRate: new Prisma.Decimal('4.00') },
              { minAge: 16, maxAge: 16, hourlyRate: new Prisma.Decimal('4.50') },
              { minAge: 17, maxAge: 17, hourlyRate: new Prisma.Decimal('5.00') },
              { minAge: 18, maxAge: 99, hourlyRate: new Prisma.Decimal('6.00') },
            ],
          },
        },
        include: {
          salaryBrackets: true,
        },
      });

      return { user, team };
    });

    await createAuthSession(res, result.user);

    return res.status(201).json({
      message: 'Boss account and team created successfully.',
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        fullName: result.user.fullName,
        role: result.user.role,
        avatarUrl: result.user.avatarUrl,
        ownedTeam: result.team,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input data.' });
    }
    console.error('Register Boss Error:', error);
    return res.status(500).json({ error: 'Failed to create Boss account.' });
  }
});

/**
 * POST /api/auth/register-worker
 */
authRouter.post('/register-worker', async (req: Request, res: Response) => {
  try {
    const data = RegisterWorkerSchema.parse(req.body);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already in use.' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const dob = new Date(data.dateOfBirth);

    // Transaction: Create Worker User + Generate Global Unique NFC Badge
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          username: data.username,
          fullName: data.fullName,
          passwordHash,
          avatarUrl: data.avatarUrl || null,
          dateOfBirth: dob,
          role: 'WORKER',
        },
      });

      // Generate random unique hardware UID e.g. "NFC-7A8B9C0D"
      const badgeUid = `NFC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      const badge = await tx.nfcBadge.create({
        data: {
          badgeUid,
          workerId: user.id,
          label: `${data.fullName}'s NFC Badge`,
        },
      });

      return { user, badge };
    });

    await createAuthSession(res, result.user);

    return res.status(201).json({
      message: 'Worker account created successfully.',
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        fullName: result.user.fullName,
        dateOfBirth: result.user.dateOfBirth,
        role: result.user.role,
        avatarUrl: result.user.avatarUrl,
        nfcBadge: result.badge,
        teamMemberships: [],
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input data.' });
    }
    console.error('Register Worker Error:', error);
    return res.status(500).json({ error: 'Failed to create Worker account.' });
  }
});

/**
 * POST /api/auth/login
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const data = LoginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.identifier }, { username: data.identifier }],
      },
      include: {
        ownedTeam: true,
        teamMemberships: {
          include: {
            team: {
              include: {
                boss: {
                  select: { id: true, fullName: true, username: true },
                },
              },
            },
          },
        },
        nfcBadge: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email/username or password.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'This account has been suspended or deactivated.' });
    }

    await createAuthSession(res, user);

    return res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        dateOfBirth: user.dateOfBirth,
        role: user.role,
        ownedTeam: user.ownedTeam,
        teamMemberships: user.teamMemberships,
        nfcBadge: user.nfcBadge,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid login details.' });
    }
    console.error('Login Error:', error);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace(/^Bearer\s+/, '');
    if (token) {
      const payload = jwt.verify(token, config.jwtSecret) as { sid?: string };
      if (payload.sid) await prisma.authSession.deleteMany({ where: { id: payload.sid } });
    }
  } catch { /* Expired sessions are already unusable. */ }
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully.' });
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        ownedTeam: {
          include: {
            members: {
              include: {
                worker: {
                  select: {
                    id: true,
                    fullName: true,
                    username: true,
                    avatarUrl: true,
                    dateOfBirth: true,
                    nfcBadge: true,
                  },
                },
              },
            },
            salaryBrackets: {
              orderBy: { minAge: 'asc' },
            },
          },
        },
        teamMemberships: {
          where: { status: 'ACTIVE' },
          include: {
            team: {
              include: {
                boss: {
                  select: { id: true, fullName: true, username: true, avatarUrl: true },
                },
              },
            },
          },
        },
        nfcBadge: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      dateOfBirth: user.dateOfBirth,
      role: user.role,
      status: user.status,
      ownedTeam: user.ownedTeam,
      teamMemberships: user.teamMemberships,
      nfcBadge: user.nfcBadge,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Get Current User Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

/**
 * PUT /api/auth/profile
 */
authRouter.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      fullName: z.string().min(2).max(100).optional(),
      avatarUrl: z.string().optional().nullable(),
      username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
    });

    const data = schema.parse(req.body);

    if (data.username) {
      const existing = await prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id: req.user!.id },
        },
      });
      if (existing) {
        return res.status(400).json({ error: 'Username already taken.' });
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        ...(data.username && { username: data.username }),
      },
    });

    return res.json({
      message: 'Profile updated successfully.',
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        fullName: updated.fullName,
        avatarUrl: updated.avatarUrl,
        role: updated.role,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid profile updates.' });
    }
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

authRouter.put('/password', authenticate, async (req, res) => {
  const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
  try {
    const { currentPassword, newPassword } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ error: 'Current password is incorrect.' });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await prisma.authSession.deleteMany({ where: { userId: user.id, ...(req.user!.sid ? { NOT: { id: req.user!.sid } } : {}) } });
    return res.json({ message: 'Password updated. Other signed-in devices have been logged out.' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message });
    return res.status(500).json({ error: 'Could not update password.' });
  }
});

authRouter.post('/email/verification/resend', authenticate, (_req, res) => res.status(410).json({ error: 'Email verification is temporarily unavailable.' }));
authRouter.post('/email/change', authenticate, (_req, res) => res.status(410).json({ error: 'Email changes are temporarily unavailable.' }));
authRouter.post('/email/verify', (_req, res) => res.status(410).json({ error: 'Email verification is temporarily unavailable.' }));