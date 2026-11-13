import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { createNotification } from '../utils/notifications.js';
import { sendNotificationPush } from '../utils/notifications.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Prisma } from '@prisma/client';
import { expireUnstartedApprovals, processOverdueChoreDeadlines } from '../utils/choreExpiry.js';

export const choreRouter = Router();


// Validation Schemas
const CreateChoreSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().min(2),
  instructions: z.string().optional().nullable(),
  category: z.enum([
    'CLEANING',
    'GARDENING',
    'COOKING',
    'ORGANISATION',
    'LAUNDRY',
    'SHOPPING',
    'MAINTENANCE',
    'OTHER',
  ]),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  paymentType: z.enum(['FIXED', 'HOURLY']),
  fixedAmount: z.number().min(0).default(0), // in Euros
  estimatedDurationMinutes: z.number().int().positive().optional().nullable(),
  weekNumber: z.number().int().min(1).max(53),
  year: z.number().int().min(2020),
  deadline: z.string().datetime().optional().nullable(),
  requestDeadline: z.string().datetime().optional().nullable(),
  requiresBeforeAfterPictures: z.boolean().default(false),
  requiresNfc: z.boolean().default(false),
  allowMultipleWorkers: z.boolean().default(false),
  pictures: z.array(z.string()).default([]),
  assignedWorkerId: z.string().optional().nullable(), // optional direct assignment
});

const RespondChoreRequestSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
});

/**
 * POST /api/chores (Boss creates a chore)
 */
choreRouter.post('/', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const data = CreateChoreSchema.parse(req.body);
    if (!data.assignedWorkerId && !data.requestDeadline) return res.status(400).json({ error: 'Set a request cutoff for chores that are open to the team.' });

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found for this Boss.' });
    }

    if (data.assignedWorkerId) {
      const member = await prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId: team.id, workerId: data.assignedWorkerId } }, include: { worker: { select: { role: true } } } });
      if (!member || member.status !== 'ACTIVE' || member.worker.role !== 'WORKER') return res.status(400).json({ error: 'Direct assignment requires an active worker in your team.' });
    }

    const chore = await prisma.chore.create({
      data: {
        teamId: team.id,
        title: data.title,
        description: data.description,
        instructions: data.instructions || null,
        category: data.category,
        priority: data.priority,
        paymentType: data.paymentType,
        fixedAmount: new Prisma.Decimal(data.fixedAmount.toFixed(2)),
        estimatedDurationMinutes: data.estimatedDurationMinutes || null,
        weekNumber: data.weekNumber,
        year: data.year,
        deadline: data.deadline ? new Date(data.deadline) : null,
        requestDeadline: data.requestDeadline ? new Date(data.requestDeadline) : null,
        requiresBeforeAfterPictures: data.requiresBeforeAfterPictures,
        requiresNfc: data.requiresNfc,
        allowMultipleWorkers: data.allowMultipleWorkers,
        pictures: data.pictures,
        status: data.assignedWorkerId ? 'ASSIGNED' : 'OPEN',
        ...(data.assignedWorkerId && {
          assignments: {
            create: {
              workerId: data.assignedWorkerId,
              status: 'APPROVED',
              approvedAt: new Date(),
            },
          },
        }),
      },
      include: {
        assignments: {
          include: {
            worker: {
              select: { id: true, fullName: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    });

    // If directly assigned, notify worker
    if (data.assignedWorkerId) {
      await createNotification({
        data: {
          userId: data.assignedWorkerId,
          teamId: team.id,
          type: 'CHORE_APPROVAL',
          title: 'Chore Assigned',
          message: `Boss ${req.user!.username} assigned you the chore "${chore.title}".`,
          linkUrl: '/worker/chores',
          referenceType: 'chore', referenceId: chore.id,
        },
      });
    }

    return res.status(201).json({ message: 'Chore created successfully.', chore });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    console.error('Create Chore Error:', error);
    return res.status(500).json({ error: 'Failed to create chore.' });
  }
});

/**
 * GET /api/chores/my-team (Boss lists chores for their team)
 */
choreRouter.get('/my-team', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    await expireUnstartedApprovals();
    await processOverdueChoreDeadlines();
    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const { week, year, status, category } = req.query;

    const chores = await prisma.chore.findMany({
      where: {
        teamId: team.id,
        ...(week && { weekNumber: parseInt(String(week), 10) }),
        ...(year && { year: parseInt(String(year), 10) }),
        ...(status && { status: String(status) as any }),
        ...(category && { category: String(category) as any }),
      },
      include: {
        assignments: {
          include: {
            worker: {
              select: { id: true, fullName: true, username: true, avatarUrl: true, dateOfBirth: true },
            },
            sessions: {
              orderBy: { clockInAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
    });

    return res.json(chores);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load chores.' });
  }
});

/**
 * GET /api/chores/available (Worker browses available chores across their teams)
 */
choreRouter.get('/available', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    await expireUnstartedApprovals();
    await processOverdueChoreDeadlines();
    const { teamId } = req.query;

    // Get all teams the worker belongs to
    const memberships = await prisma.teamMember.findMany({
      where: {
        workerId: req.user!.id,
        status: 'ACTIVE',
        ...(teamId && { teamId: String(teamId) }),
      },
      select: { teamId: true },
    });

    const activeTeamIds = memberships.map((m) => m.teamId);

    if (activeTeamIds.length === 0) {
      return res.json([]);
    }

    const chores = await prisma.chore.findMany({
      where: {
        teamId: { in: activeTeamIds },
        status: { in: ['OPEN', 'ASSIGNED'] },
        OR: [
          { requestDeadline: null },
          { requestDeadline: { gt: new Date() } },
        ],
        AND: [{ OR: [
          { allowMultipleWorkers: true },
          { assignments: { none: { status: { in: ['APPROVED', 'ACTIVE', 'COMPLETED'] } } } },
        ] }],
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            boss: {
              select: { id: true, fullName: true, username: true },
            },
          },
        },
        assignments: {
          where: { workerId: req.user!.id },
          select: { id: true, status: true, requestedAt: true, approvedAt: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { deadline: 'asc' }],
    });

    return res.json(chores);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load available chores.' });
  }
});

/**
 * POST /api/chores/:choreId/request (Worker requests to perform a chore)
 */
choreRouter.post('/:choreId/request', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    await expireUnstartedApprovals();
    const choreId = req.params.choreId as string;

    const chore = await prisma.chore.findUnique({
      where: { id: choreId },
      include: {
        team: true,
        assignments: true,
      },
    });

    if (!chore) {
      return res.status(404).json({ error: 'Chore not found.' });
    }

    if (chore.requestDeadline && chore.requestDeadline <= new Date()) {
      return res.status(410).json({ error: 'The request window for this chore has closed.' });
    }

    // Verify worker belongs to this chore's team
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId: chore.teamId,
          workerId: req.user!.id,
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'You are not an active member of the team offering this chore.' });
    }

    // Check if worker already requested or is assigned
    const existingAssignment = chore.assignments.find((a: any) => a.workerId === req.user!.id);
    if (existingAssignment && existingAssignment.status !== 'CANCELLED' && existingAssignment.status !== 'REJECTED') {
      return res.status(400).json({ 
        error: `You already have an assignment for this chore (status: ${existingAssignment.status}).` 
      });
    }

    // If single-worker chore and already assigned
    if (!chore.allowMultipleWorkers && chore.assignments.some((a: any) => a.status === 'APPROVED' || a.status === 'ACTIVE')) {
      return res.status(400).json({ error: 'This chore is already assigned to another worker.' });
    }

    const assignment = existingAssignment
      ? await prisma.choreAssignment.update({ where: { id: existingAssignment.id }, data: { status: 'REQUESTED', requestedAt: new Date(), approvedAt: null, completedAt: null } })
      : await prisma.choreAssignment.create({ data: { choreId: chore.id, workerId: req.user!.id, status: 'REQUESTED' } });

    // Notify Boss
    await createNotification({
      data: {
        userId: chore.team.bossId,
        teamId: chore.teamId,
        type: 'CHORE_REQUEST',
        title: 'Chore Request',
        message: `${req.user!.username} requested to do "${chore.title}".`,
        linkUrl: '/boss/chores',
        referenceType: 'chore', referenceId: chore.id,
      },
    });

    return res.status(201).json({ message: 'Chore request submitted to Boss for approval.', assignment });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to request chore.' });
  }
});

/**
 * POST /api/chores/requests/:assignmentId/respond (Boss approves or rejects assignment request)
 */
choreRouter.post('/requests/:assignmentId/respond', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const assignmentId = req.params.assignmentId as string;
    const { action } = RespondChoreRequestSchema.parse(req.body);

    const assignment = await prisma.choreAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        chore: { include: { team: true } },
        worker: true,
      },
    });

    if (!assignment || assignment.chore.team.bossId !== req.user!.id) {
      return res.status(404).json({ error: 'Assignment request not found.' });
    }

    if (assignment.status !== 'REQUESTED') {
      return res.status(400).json({ error: 'This request has already been processed.' });
    }

    if (action === 'APPROVE') {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.choreAssignment.update({ where: { id: assignmentId }, data: { status: 'APPROVED', approvedAt: new Date() } });
        await tx.chore.update({ where: { id: assignment.choreId }, data: { status: 'ASSIGNED' } });
        return tx.notification.create({
          data: {
            userId: assignment.workerId,
            teamId: assignment.chore.teamId,
            type: 'CHORE_APPROVAL',
            title: 'Chore Request Approved!',
            message: `Boss ${req.user!.username} approved your request for "${assignment.chore.title}". You can now start the chore!`,
            linkUrl: '/worker/chores',
            referenceType: 'chore', referenceId: assignment.choreId,
          },
        });
      });
      await sendNotificationPush(notification.id);

      return res.json({ message: 'Chore assigned to worker successfully.' });
    } else {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.choreAssignment.update({ where: { id: assignmentId }, data: { status: 'REJECTED' } });
        return tx.notification.create({
          data: {
            userId: assignment.workerId,
            teamId: assignment.chore.teamId,
            type: 'CHORE_REJECTION',
            title: 'Chore Request Declined',
            message: `Your request for "${assignment.chore.title}" was declined by the Boss.`,
            linkUrl: '/worker/chores',
            referenceType: 'chore', referenceId: assignment.choreId,
          },
        });
      });
      await sendNotificationPush(notification.id);

      return res.json({ message: 'Chore request declined.' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to process request.' });
  }
});

/**
 * GET /api/chores/my-assignments (Worker lists their assignments across all teams)
 */
choreRouter.get('/my-assignments', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    await expireUnstartedApprovals();
    await processOverdueChoreDeadlines();
    const { status, teamId } = req.query;

    const assignments = await prisma.choreAssignment.findMany({
      where: {
        workerId: req.user!.id,
        ...(status && { status: String(status) as any }),
        ...(teamId && { chore: { teamId: String(teamId) } }),
      },
      include: {
        chore: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                boss: { select: { fullName: true, username: true } },
              },
            },
          },
        },
        sessions: {
          orderBy: { clockInAt: 'desc' },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return res.json(assignments);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load assignments.' });
  }
});

/**
 * DELETE /api/chores/:choreId (Boss deletes an unassigned chore)
 */
choreRouter.delete('/:choreId', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const choreId = req.params.choreId as string;

    const chore = await prisma.chore.findUnique({
      where: { id: choreId },
      include: {
        team: true,
        assignments: {
          include: { sessions: true },
        },
      },
    });

    if (!chore || chore.team.bossId !== req.user!.id) {
      return res.status(404).json({ error: 'Chore not found.' });
    }

    // Prevent deleting chores that already have work sessions or historical records
    const hasSessions = chore.assignments.some((a) => a.sessions.length > 0);
    if (hasSessions || chore.assignments.length > 0 || !['OPEN', 'CANCELLED'].includes(chore.status)) {
      return res.status(409).json({
        error: hasSessions
          ? 'This chore has work history and cannot be deleted. Its financial and work records must be preserved.'
          : chore.assignments.length > 0
            ? 'This chore has a worker assignment or request and cannot be deleted.'
            : 'This chore is already in progress or completed and cannot be deleted.',
      });
    }

    // Safely delete unassigned chore (or chore with only pending requests)
    await prisma.chore.delete({
      where: { id: choreId },
    });

    return res.json({ message: 'Chore deleted successfully from the list.' });
  } catch (error) {
    console.error('Delete chore error:', error);
    return res.status(500).json({ error: 'Failed to delete chore.' });
  }
});
