import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { createNotification } from '../utils/notifications.js';
import { sendNotificationEmail } from '../utils/notifications.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { calculateAge } from '../utils/age.js';
import { calculateHourlyEarnings, roundUpEuro } from '../utils/currency.js';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { config } from '../config.js';

export const sessionRouter = Router();

// Validation Schemas
const NfcClockInSchema = z.object({
  badgeUid: z.string().min(1),
  choreId: z.string().min(1),
  method: z.enum(['NFC', 'QR', 'MANUAL']).default('NFC'),
  proof: z.string().optional(),
  issuedAt: z.number().optional(),
});

const NfcClockOutSchema = z.object({
  badgeUid: z.string().min(1),
  sessionId: z.string().optional(),
  method: z.enum(['NFC', 'QR', 'MANUAL']).default('NFC'),
  notes: z.string().optional(),
  proof: z.string().optional(),
  issuedAt: z.number().optional(),
});

function makeBadgeProof(badgeUid: string, workerId: string, issuedAt: number) {
  return crypto.createHmac('sha256', config.jwtSecret).update(`${badgeUid}:${workerId}:${issuedAt}`).digest('hex');
}

function validBadgeProof(badgeUid: string, workerId: string, proof?: string, issuedAt?: number) {
  if (!proof || !issuedAt || Math.abs(Date.now() - issuedAt) > 2 * 60 * 1000) return false;
  const expected = Buffer.from(makeBadgeProof(badgeUid, workerId, issuedAt));
  const received = Buffer.from(proof);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

const RemoteStartSchema = z.object({
  assignmentId: z.string().min(1),
  beforePictureUrl: z.string().optional(),
  notes: z.string().optional(),
});

const RemoteSubmitSchema = z.object({
  sessionId: z.string().min(1),
  afterPictureUrl: z.string().optional(),
  notes: z.string().optional(),
});

const SessionApprovalSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().optional(),
});

const LinkNfcBadgeSchema = z.object({
  badgeUid: z.string().min(2).max(100),
  label: z.string().optional(),
  workerId: z.string().optional(),
});

/**
 * POST /api/sessions/nfc/link (Link physical NFC tag to a worker account)
 */
sessionRouter.post('/nfc/link', authenticate, async (req: Request, res: Response) => {
  try {
    const data = LinkNfcBadgeSchema.parse(req.body);

    let targetWorkerId = req.user!.id;

    // If caller is BOSS, they can link for a worker in their team
    if (req.user!.role === 'BOSS') {
      if (!data.workerId) {
        return res.status(400).json({ error: 'Worker ID is required when linking as Boss.' });
      }

      const team = await prisma.team.findUnique({
        where: { bossId: req.user!.id },
        include: { members: { where: { workerId: data.workerId, status: 'ACTIVE' } } },
      });

      if (!team || team.members.length === 0) {
        return res.status(403).json({ error: 'Worker is not an active member of your team.' });
      }

      targetWorkerId = data.workerId;
    } else {
      targetWorkerId = req.user!.id;
    }

    // Verify badge UID isn't already used by another worker
    const existingBadge = await prisma.nfcBadge.findUnique({
      where: { badgeUid: data.badgeUid },
    });

    if (existingBadge && existingBadge.workerId !== targetWorkerId) {
      return res.status(400).json({ 
        error: 'This NFC tag is already linked to another worker. Each physical badge must be unique.' 
      });
    }

    const badge = await prisma.nfcBadge.upsert({
      where: { workerId: targetWorkerId },
      create: {
        workerId: targetWorkerId,
        badgeUid: data.badgeUid,
        label: data.label || 'Physical NFC Tag',
      },
      update: {
        badgeUid: data.badgeUid,
        label: data.label || 'Physical NFC Tag',
      },
      include: {
        worker: {
          select: { id: true, fullName: true, username: true },
        },
      },
    });

    return res.json({
      message: `NFC tag "${data.badgeUid}" successfully linked to ${badge.worker.fullName}!`,
      badge,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    console.error('Link NFC Badge Error:', error);
    return res.status(500).json({ error: 'Failed to link NFC badge.' });
  }
});

sessionRouter.post('/nfc/reassign', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const { badgeUid, workerId } = z.object({ badgeUid: z.string().min(2).max(100), workerId: z.string().min(1) }).parse(req.body);
    const team = await prisma.team.findUnique({ where: { bossId: req.user!.id } });
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    const badge = await prisma.nfcBadge.findUnique({ where: { badgeUid } });
    if (!badge) return res.status(404).json({ error: 'Badge is not registered.' });
    const [currentMembership, targetMembership, target] = await Promise.all([
      prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId: team.id, workerId: badge.workerId } } }),
      prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId: team.id, workerId } } }),
      prisma.user.findUnique({ where: { id: workerId }, select: { role: true, nfcBadge: true } }),
    ]);
    if (!currentMembership) return res.status(403).json({ error: 'The current badge owner has no membership history with your team.' });
    if (badge.workerId === workerId) return res.status(400).json({ error: 'This badge already belongs to that worker.' });
    if (!target || target.role !== 'WORKER' || !targetMembership || targetMembership.status !== 'ACTIVE') return res.status(403).json({ error: 'The new owner must be an active worker in your team.' });
    if (target.nfcBadge) return res.status(409).json({ error: 'The new owner already has a badge. Unlink or transfer that badge first.' });
    await prisma.$transaction(async (tx) => {
      await tx.nfcBadge.delete({ where: { id: badge.id } });
      await tx.badgeAuditLog.create({ data: { badgeUid, fromWorkerId: badge.workerId, toWorkerId: workerId, actorUserId: req.user!.id, teamId: team.id } });
      await tx.nfcBadge.create({ data: { badgeUid, workerId, label: badge.label || 'Transferred NFC Badge' } });
    });
    return res.json({ message: 'Badge reassigned and recorded in the team activity log.' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message });
    return res.status(500).json({ error: 'Could not reassign this badge.' });
  }
});

/**
 * GET /api/sessions/qr/badge (Worker gets their QR badge data and dataURL)
 */
sessionRouter.get('/qr/badge', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const badge = await prisma.nfcBadge.findUnique({
      where: { workerId: req.user!.id },
      include: {
        worker: {
          select: { id: true, fullName: true, username: true, avatarUrl: true },
        },
      },
    });

    if (!badge) {
      return res.status(404).json({ error: 'NFC/QR badge not found.' });
    }

    // A QR payload contains a short-lived signed badge reference, not personal details or a login token.
    const issuedAt = Date.now();
    const proof = makeBadgeProof(badge.badgeUid, badge.workerId, issuedAt);
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify({
      type: 'CHORE_MANAGER_BADGE',
      badgeUid: badge.badgeUid,
      issuedAt,
      proof,
    }));

    return res.json({
      badgeUid: badge.badgeUid,
      worker: badge.worker,
      qrDataUrl,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate QR badge.' });
  }
});

sessionRouter.get('/identify/:badgeUid', authenticate, requireRole('BOSS'), async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { bossId: req.user!.id } });
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    const badgeUid = String(req.params.badgeUid);
    const badge = await prisma.nfcBadge.findUnique({ where: { badgeUid }, include: { worker: { select: { id: true, fullName: true, username: true, avatarUrl: true } } } });
    if (!badge) return res.status(404).json({ error: 'Badge not recognized.' });
    const proof = typeof req.query.proof === 'string' ? req.query.proof : undefined;
    const issuedAt = Number(req.query.issuedAt);
    if (proof && !validBadgeProof(badgeUid, badge.workerId, proof, issuedAt)) return res.status(401).json({ error: 'This QR badge has expired or is invalid. Ask the worker to refresh their badge.' });
    const membership = await prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId: team.id, workerId: badge.workerId } } });
    if (!membership || membership.status !== 'ACTIVE') return res.status(403).json({ error: 'This worker is not an active member of your team.' });
    const [assignments, activeSession] = await Promise.all([
      prisma.choreAssignment.findMany({ where: { workerId: badge.workerId, status: 'APPROVED', chore: { teamId: team.id } }, include: { chore: { select: { id: true, title: true, paymentType: true, fixedAmount: true } } } }),
      prisma.choreSession.findFirst({ where: { workerId: badge.workerId, teamId: team.id, status: 'ACTIVE' }, include: { assignment: { include: { chore: { select: { id: true, title: true } } } } } }),
    ]);
    return res.json({ worker: badge.worker, assignments, activeSession, badgeUid, proof, issuedAt });
  } catch { return res.status(500).json({ error: 'Could not identify badge.' }); }
});

/**
 * POST /api/sessions/clock-in (Boss scans Worker's NFC/QR badge to clock in)
 */
sessionRouter.post('/clock-in', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const data = NfcClockInSchema.parse(req.body);

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found for this Boss.' });
    }

    // Identify worker by badge UID
    const badge = await prisma.nfcBadge.findUnique({
      where: { badgeUid: data.badgeUid },
      include: {
        worker: true,
      },
    });

    if (!badge) {
      return res.status(404).json({ error: 'Invalid or unregistered badge.' });
    }

    const worker = badge.worker;
    if (data.method === 'QR' && !validBadgeProof(data.badgeUid, worker.id, data.proof, data.issuedAt)) {
      return res.status(401).json({ error: 'QR badge signature expired or invalid. Refresh the worker badge and scan again.' });
    }

    // Verify worker is active member of this team
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId: team.id,
          workerId: worker.id,
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).json({ error: `${worker.fullName} is not an active member of your team.` });
    }

    // Verify chore belongs to this team
    const chore = await prisma.chore.findUnique({
      where: { id: data.choreId },
      include: {
        assignments: {
          where: { workerId: worker.id },
        },
      },
    });

    if (!chore || chore.teamId !== team.id) {
      return res.status(404).json({ error: 'Chore not found in your team.' });
    }

    // Check if chore is approved for this worker
    let assignment = chore.assignments[0];
    if (!assignment || assignment.status !== 'APPROVED') {
      return res.status(400).json({ 
        error: `Chore is not approved for ${worker.fullName}. Please approve assignment first.` 
      });
    }
    if (assignment.approvedAt && assignment.approvedAt.getTime() <= Date.now() - 48 * 60 * 60 * 1000) {
      await prisma.$transaction(async (tx) => {
        await tx.choreAssignment.updateMany({ where: { id: assignment.id, status: 'APPROVED' }, data: { status: 'CANCELLED' } });
        const remaining = await tx.choreAssignment.count({ where: { choreId: chore.id, status: { in: ['APPROVED', 'ACTIVE'] } } });
        if (!remaining) await tx.chore.updateMany({ where: { id: chore.id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, data: { status: 'OPEN' } });
      });
      return res.status(410).json({ error: 'The 48-hour start window has expired. This chore is available to the team again.' });
    }

    // Prevent duplicate overlapping active sessions
    const activeSession = await prisma.choreSession.findFirst({
      where: {
        workerId: worker.id,
        status: 'ACTIVE',
      },
    });

    if (activeSession) {
      return res.status(400).json({ 
        error: `${worker.fullName} already has an active clock-in session in progress.` 
      });
    }

    // Calculate current age and determine applicable hourly rate
    const workerAge = worker.dateOfBirth ? calculateAge(worker.dateOfBirth) : 18;
    let hourlyRate: Prisma.Decimal | null = null;

    if (chore.paymentType === 'HOURLY') {
      const bracket = await prisma.salaryBracket.findFirst({
        where: {
          teamId: team.id,
          minAge: { lte: workerAge },
          maxAge: { gte: workerAge },
        },
      });

      if (bracket) {
        hourlyRate = bracket.hourlyRate;
      } else {
        // Fallback default
        hourlyRate = new Prisma.Decimal('4.00');
      }
    }

    const session = await prisma.choreSession.create({
      data: {
        assignmentId: assignment.id,
        workerId: worker.id,
        teamId: team.id,
        clockInAt: new Date(),
        clockInMethod: data.method as any,
        workerAgeAtWork: workerAge,
        hourlyRateApplied: hourlyRate,
        status: 'ACTIVE',
      },
    });

    // Update assignment status to ACTIVE
    await prisma.choreAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACTIVE' },
    });

    // Update lastScannedAt on badge
    await prisma.nfcBadge.update({
      where: { id: badge.id },
      data: { lastScannedAt: new Date() },
    });

    return res.status(201).json({
      message: `${worker.fullName} clocked in successfully for "${chore.title}".`,
      session,
      worker: {
        id: worker.id,
        fullName: worker.fullName,
        username: worker.username,
        avatarUrl: worker.avatarUrl,
        age: workerAge,
      },
      chore: {
        title: chore.title,
        paymentType: chore.paymentType,
        hourlyRate: hourlyRate?.toString() || null,
        fixedAmount: chore.fixedAmount.toString(),
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    console.error('Clock-in Error:', error);
    return res.status(500).json({ error: 'Failed to clock in.' });
  }
});

/**
 * POST /api/sessions/clock-out (Boss scans Worker's badge to clock out)
 */
sessionRouter.post('/clock-out', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const data = NfcClockOutSchema.parse(req.body);

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found for this Boss.' });
    }

    const badge = await prisma.nfcBadge.findUnique({
      where: { badgeUid: data.badgeUid },
      include: { worker: true },
    });

    if (!badge) {
      return res.status(404).json({ error: 'Badge not recognized.' });
    }

    if (data.method === 'QR' && !validBadgeProof(data.badgeUid, badge.workerId, data.proof, data.issuedAt)) {
      return res.status(401).json({ error: 'QR badge signature expired or invalid. Refresh the worker badge and scan again.' });
    }

    // Find active session in this team for this worker
    const session = await prisma.choreSession.findFirst({
      where: {
        workerId: badge.workerId,
        teamId: team.id,
        status: 'ACTIVE',
      },
      include: {
        assignment: {
          include: { chore: true },
        },
      },
    });

    if (!session) {
      return res.status(400).json({ 
        error: `No active work session found for ${badge.worker.fullName} in your team.` 
      });
    }

    const clockOutTime = new Date();
    const durationSeconds = Math.max(1, Math.floor((clockOutTime.getTime() - session.clockInAt.getTime()) / 1000));

    let finalAmount = new Prisma.Decimal('0.00');

    if (session.assignment.chore.paymentType === 'FIXED') {
      finalAmount = session.assignment.chore.fixedAmount;
    } else {
      // Hourly payment calculation: duration * hourlyRateApplied, rounded UP to 2 digits after comma
      const rate = session.hourlyRateApplied || new Prisma.Decimal('4.00');
      finalAmount = calculateHourlyEarnings(durationSeconds, rate);
    }

    // Update session and record immutable piggy bank transaction
    const result = await prisma.$transaction(async (tx) => {
      const updatedSession = await tx.choreSession.update({
        where: { id: session.id },
        data: {
          clockOutAt: clockOutTime,
          durationSeconds,
          clockOutMethod: data.method as any,
          finalAmount,
          status: 'APPROVED', // Since Boss physically scanned clock-out, it is approved directly
          approvedAt: clockOutTime,
          approvedById: req.user!.id,
          notes: data.notes || session.notes,
        },
      });

      // Update assignment
      await tx.choreAssignment.update({
        where: { id: session.assignmentId },
        data: {
          status: 'COMPLETED',
          completedAt: clockOutTime,
        },
      });

      // Update chore if single worker
      if (!session.assignment.chore.allowMultipleWorkers) {
        await tx.chore.update({
          where: { id: session.assignment.choreId },
          data: { status: 'COMPLETED' },
        });
      }

      // Record immutable PiggyBank Transaction
      const transaction = await tx.piggyBankTransaction.create({
        data: {
          workerId: session.workerId,
          teamId: team.id,
          choreSessionId: session.id,
          amount: finalAmount,
          type: 'EARNING',
          description: `Chore completed: ${session.assignment.chore.title}`,
        },
      });

      // Create notification for Worker
      const notification = await tx.notification.create({
        data: {
          userId: session.workerId,
          teamId: team.id,
          type: 'CHORE_APPROVAL',
          title: 'Chore Approved & Credited!',
          message: `You earned ${finalAmount.toString().replace('.', ',')} € for "${session.assignment.chore.title}".`,
          linkUrl: '/worker/piggy-bank',
          referenceType: 'session', referenceId: session.id,
        },
      });

      return { updatedSession, transaction, notification };
    });
    await sendNotificationEmail(result.notification.id);

    return res.json({
      message: `${badge.worker.fullName} clocked out. ${finalAmount.toString().replace('.', ',')} € credited!`,
      session: result.updatedSession,
      transaction: result.transaction,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    console.error('Clock-out Error:', error);
    return res.status(500).json({ error: 'Failed to clock out.' });
  }
});

/**
 * POST /api/sessions/remote/start (Worker starts remote session with before photo)
 */
sessionRouter.post('/remote/start', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const data = RemoteStartSchema.parse(req.body);

    const assignment = await prisma.choreAssignment.findUnique({
      where: { id: data.assignmentId },
      include: {
        chore: { include: { team: true } },
        worker: true,
      },
    });

    if (!assignment || assignment.workerId !== req.user!.id) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    if (assignment.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Chore must be approved by Boss before starting.' });
    }
    if (assignment.approvedAt && assignment.approvedAt.getTime() <= Date.now() - 48 * 60 * 60 * 1000) {
      await prisma.$transaction(async (tx) => {
        await tx.choreAssignment.updateMany({ where: { id: assignment.id, status: 'APPROVED' }, data: { status: 'CANCELLED' } });
        const remaining = await tx.choreAssignment.count({ where: { choreId: assignment.choreId, status: { in: ['APPROVED', 'ACTIVE'] } } });
        if (!remaining) await tx.chore.updateMany({ where: { id: assignment.choreId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, data: { status: 'OPEN' } });
      });
      return res.status(410).json({ error: 'The 48-hour start window has expired. This chore is available to the team again.' });
    }

    // Enforce photo if required by chore
    if (assignment.chore.requiresBeforeAfterPictures && !data.beforePictureUrl) {
      return res.status(400).json({ error: 'A BEFORE picture is required to start this chore.' });
    }

    // Check for existing active session
    const active = await prisma.choreSession.findFirst({
      where: { workerId: req.user!.id, status: 'ACTIVE' },
    });
    if (active) {
      return res.status(400).json({ error: 'You already have an active chore session in progress.' });
    }

    const workerAge = assignment.worker.dateOfBirth ? calculateAge(assignment.worker.dateOfBirth) : 18;
    let hourlyRate: Prisma.Decimal | null = null;

    if (assignment.chore.paymentType === 'HOURLY') {
      const bracket = await prisma.salaryBracket.findFirst({
        where: {
          teamId: assignment.chore.teamId,
          minAge: { lte: workerAge },
          maxAge: { gte: workerAge },
        },
      });
      hourlyRate = bracket?.hourlyRate || new Prisma.Decimal('4.00');
    }

    const session = await prisma.choreSession.create({
      data: {
        assignmentId: assignment.id,
        workerId: req.user!.id,
        teamId: assignment.chore.teamId,
        clockInAt: new Date(),
        clockInMethod: 'REMOTE',
        isRemote: true,
        beforePictureUrl: data.beforePictureUrl || null,
        workerAgeAtWork: workerAge,
        hourlyRateApplied: hourlyRate,
        notes: data.notes || null,
        status: 'ACTIVE',
      },
    });

    await prisma.choreAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACTIVE' },
    });

    return res.status(201).json({ message: 'Remote chore started successfully.', session });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to start remote session.' });
  }
});

/**
 * POST /api/sessions/remote/submit (Worker submits completed remote chore for approval)
 */
sessionRouter.post('/remote/submit', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const data = RemoteSubmitSchema.parse(req.body);

    const session = await prisma.choreSession.findUnique({
      where: { id: data.sessionId },
      include: {
        assignment: { include: { chore: { include: { team: true } } } },
      },
    });

    if (!session || session.workerId !== req.user!.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (session.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Session is not in active state.' });
    }

    if (session.assignment.chore.requiresBeforeAfterPictures && !data.afterPictureUrl) {
      return res.status(400).json({ error: 'An AFTER picture is required to submit this chore.' });
    }

    const clockOutTime = new Date();
    const durationSeconds = Math.max(1, Math.floor((clockOutTime.getTime() - session.clockInAt.getTime()) / 1000));

    let finalAmount = new Prisma.Decimal('0.00');
    if (session.assignment.chore.paymentType === 'FIXED') {
      finalAmount = session.assignment.chore.fixedAmount;
    } else {
      const rate = session.hourlyRateApplied || new Prisma.Decimal('4.00');
      finalAmount = calculateHourlyEarnings(durationSeconds, rate);
    }

    const updatedSession = await prisma.choreSession.update({
      where: { id: session.id },
      data: {
        clockOutAt: clockOutTime,
        durationSeconds,
        clockOutMethod: 'REMOTE',
        afterPictureUrl: data.afterPictureUrl || null,
        finalAmount,
        notes: data.notes ? `${session.notes || ''}\n${data.notes}` : session.notes,
        status: 'SUBMITTED', // Awaiting Boss review
      },
    });

    // Notify Boss
    await createNotification({
      data: {
        userId: session.assignment.chore.team.bossId,
        teamId: session.teamId,
        type: 'CLOCK_EVENT',
        title: 'Chore Ready for Approval',
        message: `${req.user!.username} finished "${session.assignment.chore.title}". Please review proof and approve.`,
        linkUrl: '/boss/approvals',
        referenceType: 'session', referenceId: session.id,
      },
    });

    return res.json({
      message: 'Chore submitted for Boss review and approval.',
      session: updatedSession,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to submit remote session.' });
  }
});

/**
 * POST /api/sessions/:sessionId/review (Boss approves or rejects submitted session)
 */
sessionRouter.post('/:sessionId/review', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const { approved, rejectionReason } = SessionApprovalSchema.parse(req.body);

    const session = await prisma.choreSession.findUnique({
      where: { id: sessionId },
      include: {
        team: true,
        assignment: { include: { chore: true } },
        worker: true,
      },
    });

    if (!session || session.team.bossId !== req.user!.id) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (session.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Session is not currently awaiting approval.' });
    }

    if (approved) {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.choreSession.update({
          where: { id: sessionId },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedById: req.user!.id,
          },
        });

        await tx.choreAssignment.update({
          where: { id: session.assignmentId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        if (!session.assignment.chore.allowMultipleWorkers) {
          await tx.chore.update({
            where: { id: session.assignment.choreId },
            data: { status: 'COMPLETED' },
          });
        }

        // Ledger record
        await tx.piggyBankTransaction.create({
          data: {
            workerId: session.workerId,
            teamId: session.teamId,
            choreSessionId: session.id,
            amount: session.finalAmount,
            type: 'EARNING',
            description: `Chore approved: ${session.assignment.chore.title}`,
          },
        });

        // Notification
        return tx.notification.create({
          data: {
            userId: session.workerId,
            teamId: session.teamId,
            type: 'CHORE_APPROVAL',
            title: 'Chore Approved!',
            message: `Boss approved "${session.assignment.chore.title}". +${session.finalAmount.toString().replace('.', ',')} € credited!`,
            linkUrl: '/worker/piggy-bank',
            referenceType: 'session', referenceId: session.id,
          },
        });
      });
      await sendNotificationEmail(notification.id);

      return res.json({ message: 'Session approved and earnings credited to worker piggy bank.' });
    } else {
      if (!rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required when declining a chore submission.' });
      }

      const notification = await prisma.$transaction(async (tx) => {
        await tx.choreSession.update({
          where: { id: sessionId },
          data: {
            status: 'REJECTED',
            rejectionReason,
          },
        });
        await tx.choreAssignment.update({
          where: { id: session.assignmentId },
          data: { status: 'APPROVED' }, // allow re-work
        });
        return tx.notification.create({
          data: {
            userId: session.workerId,
            teamId: session.teamId,
            type: 'CHORE_REJECTION',
            title: 'Chore Submission Needs Work',
            message: `Boss requested changes on "${session.assignment.chore.title}": ${rejectionReason}`,
            linkUrl: '/worker/chores',
            referenceType: 'session', referenceId: session.id,
          },
        });
      });
      await sendNotificationEmail(notification.id);

      return res.json({ message: 'Chore returned to worker with feedback.' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to review session.' });
  }
});

/**
 * GET /api/sessions/active (Get currently active session for worker or boss)
 */
sessionRouter.get('/active', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role === 'WORKER') {
      const activeSession = await prisma.choreSession.findFirst({
        where: {
          workerId: req.user!.id,
          status: 'ACTIVE',
        },
        include: {
          team: { select: { id: true, name: true } },
          assignment: { include: { chore: true } },
        },
      });
      return res.json(activeSession);
    } else {
      const team = await prisma.team.findUnique({
        where: { bossId: req.user!.id },
      });
      if (!team) return res.json([]);

      const activeSessions = await prisma.choreSession.findMany({
        where: {
          teamId: team.id,
          status: 'ACTIVE',
        },
        include: {
          worker: {
            select: { id: true, fullName: true, username: true, avatarUrl: true },
          },
          assignment: { include: { chore: true } },
        },
      });
      return res.json(activeSessions);
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch active sessions.' });
  }
});
