import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { createNotification, sendNotificationPush } from '../utils/notifications.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Prisma } from '@prisma/client';
import { getNextPaymentDate } from '../utils/paymentSchedule.js';

export const teamRouter = Router();

async function scheduledPaymentDate(team: { id: string; paymentSchedule: string; customPaymentIntervalDays: number | null; customPaymentDay: number | null }) {
  const currentPeriod = await prisma.paymentPeriod.findFirst({ where: { teamId: team.id, status: 'OPEN' }, orderBy: { endDate: 'asc' } });
  return currentPeriod?.endDate || getNextPaymentDate(team.paymentSchedule, team.customPaymentIntervalDays, team.customPaymentDay);
}

// Validation Schemas
const UpdateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  paymentSchedule: z.enum(['WEEKLY_SUNDAY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']).optional(),
});

const InviteWorkerSchema = z.object({
  workerIdentifier: z.string().min(1), // email or username
  message: z.string().optional(),
});

const RespondInvitationSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});

const UpdateSalaryBracketsSchema = z.object({
  brackets: z.array(
    z.object({
      minAge: z.number().int().min(0).max(120),
      maxAge: z.number().int().min(0).max(120),
      hourlyRate: z.number().positive(), // in Euros e.g. 4.50
    })
  ),
});

/**
 * GET /api/teams/my-team (Boss only)
 */
teamRouter.get('/my-team', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
      include: {
        members: {
          include: {
            worker: {
              select: {
                id: true,
                fullName: true,
                username: true,
                email: true,
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
        invitations: {
          include: {
            worker: {
              select: { id: true, fullName: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found for this Boss.' });
    }

    return res.json({ ...team, nextPaymentDate: await scheduledPaymentDate(team) });
  } catch (error) {
    console.error('Get My Team Error:', error);
    return res.status(500).json({ error: 'Failed to load team data.' });
  }
});

/**
 * PUT /api/teams/my-team (Boss only)
 */
teamRouter.put('/my-team', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const data = UpdateTeamSchema.parse(req.body);

    const team = await prisma.team.update({
      where: { bossId: req.user!.id },
      data,
    });

    return res.json({ message: 'Team profile updated successfully.', team });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to update team profile.' });
  }
});

/**
 * GET /api/teams/search-workers?q= (Boss only)
 */
teamRouter.put('/my-team/payment-settings', authenticate, requireRole('BOSS'), async (req, res) => {
  const schema = z.object({
    paymentSchedule: z.enum(['WEEKLY_SUNDAY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM']),
    customPaymentIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
    customPaymentDay: z.number().int().min(1).max(28).nullable().optional(),
  }).superRefine((settings, ctx) => {
    if (settings.paymentSchedule === 'CUSTOM' && !settings.customPaymentIntervalDays && !settings.customPaymentDay) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a custom interval or day of month.' });
    }
  });
  try {
    const data = schema.parse(req.body);
    const team = await prisma.team.update({ where: { bossId: req.user!.id }, data: {
      paymentSchedule: data.paymentSchedule,
      customPaymentIntervalDays: data.paymentSchedule === 'CUSTOM' ? data.customPaymentIntervalDays || null : null,
      customPaymentDay: data.paymentSchedule === 'CUSTOM' ? data.customPaymentDay || null : null,
    } });
    return res.json({ team, nextPaymentDate: await scheduledPaymentDate(team) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message });
    return res.status(500).json({ error: 'Could not save payment settings.' });
  }
});

teamRouter.delete('/my-team/invitations/:invitationId', authenticate, requireRole('BOSS'), async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { bossId: req.user!.id }, select: { id: true } });
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    const invitation = await prisma.teamInvitation.findFirst({ where: { id: String(req.params.invitationId), teamId: team.id, status: 'PENDING' } });
    if (!invitation) return res.status(404).json({ error: 'Pending invitation not found.' });
    await prisma.teamInvitation.update({ where: { id: invitation.id }, data: { status: 'CANCELLED' } });
    return res.json({ message: 'Invitation cancelled.' });
  } catch { return res.status(500).json({ error: 'Could not cancel invitation.' }); }
});

teamRouter.get('/my-teams', authenticate, requireRole('WORKER'), async (req, res) => {
  try {
    const memberships = await prisma.teamMember.findMany({
      where: { workerId: req.user!.id, status: 'ACTIVE' },
      include: { team: { include: { boss: { select: { id: true, fullName: true, username: true, avatarUrl: true } }, members: { where: { status: 'ACTIVE' }, select: { id: true } } } } },
      orderBy: { joinedAt: 'asc' },
    });
    const teams = await Promise.all(memberships.map(async (membership) => {
      const [balance, unfinishedChores] = await Promise.all([
        prisma.piggyBankTransaction.aggregate({ where: { workerId: req.user!.id, teamId: membership.teamId }, _sum: { amount: true } }),
        prisma.choreAssignment.count({ where: { workerId: req.user!.id, status: { in: ['REQUESTED', 'APPROVED', 'ACTIVE'] }, chore: { teamId: membership.teamId } } }),
      ]);
      return { ...membership, activeMemberCount: membership.team.members.length, unpaid: (balance._sum.amount || new Prisma.Decimal(0)).toFixed(2), unfinishedChores };
    }));
    return res.json(teams);
  } catch { return res.status(500).json({ error: 'Could not load your teams.' }); }
});

teamRouter.get('/search-workers', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.json([]);
    }

    // Find workers matching query who are not already in the boss's team
    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
      select: { id: true },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const workers = await prisma.user.findMany({
      where: {
        role: 'WORKER',
        status: 'ACTIVE',
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        teamMemberships: {
          none: {
            teamId: team.id,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        avatarUrl: true,
        dateOfBirth: true,
      },
      take: 10,
    });

    return res.json(workers);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to search workers.' });
  }
});

/**
 * POST /api/teams/invite-worker (Boss only)
 */
teamRouter.post('/invite-worker', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const data = InviteWorkerSchema.parse(req.body);

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const worker = await prisma.user.findFirst({
      where: {
        role: 'WORKER',
        OR: [{ email: data.workerIdentifier }, { username: data.workerIdentifier }],
      },
    });

    if (!worker) {
      return res.status(404).json({ error: 'Worker not found.' });
    }

    // Check if already an active member
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId: team.id,
          workerId: worker.id,
        },
      },
    });

    if (existingMember && existingMember.status === 'ACTIVE') {
      return res.status(400).json({ error: 'Worker is already an active member of this team.' });
    }

    // Check if an active invitation already exists
    const existingInvite = await prisma.teamInvitation.findFirst({
      where: {
        teamId: team.id,
        workerId: worker.id,
        status: 'PENDING',
      },
    });

    if (existingInvite) {
      return res.status(400).json({ error: 'A pending invitation or request already exists for this worker.' });
    }

    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId: team.id,
        workerId: worker.id,
        type: 'BOSS_INVITE',
        message: data.message || `Invitation to join ${team.name}`,
      },
    });

    // Create notification for worker
    await createNotification({
      data: {
        userId: worker.id,
        teamId: team.id,
        type: 'INVITATION',
        title: 'New Team Invitation',
        message: `You were invited to join "${team.name}" by ${req.user!.username}.`,
        linkUrl: '/worker/teams',
        referenceType: 'invitation', referenceId: invitation.id,
      },
    });

    return res.status(201).json({ message: 'Invitation sent successfully.', invitation });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to send invitation.' });
  }
});

/**
 * GET /api/teams/search-teams?q= (Worker only)
 */
teamRouter.get('/search-teams', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();

    const teams = await prisma.team.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { boss: { fullName: { contains: query, mode: 'insensitive' } } },
              { boss: { username: { contains: query, mode: 'insensitive' } } },
            ],
          }
        : {},
      include: {
        boss: {
          select: { id: true, fullName: true, username: true, avatarUrl: true },
        },
        members: {
          where: { workerId: req.user!.id },
          select: { status: true },
        },
        invitations: {
          where: { workerId: req.user!.id, status: 'PENDING' },
          select: { id: true, type: true, status: true },
        },
        _count: {
          select: { members: { where: { status: 'ACTIVE' } } },
        },
      },
      take: 20,
    });

    const result = teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      avatarUrl: team.avatarUrl,
      boss: team.boss,
      activeMembersCount: team._count.members,
      membershipStatus: team.members[0]?.status || null,
      pendingInvitation: team.invitations[0] || null,
    }));

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to search teams.' });
  }
});

/**
 * POST /api/teams/:teamId/request-join (Worker requests to join)
 */
teamRouter.post('/:teamId/request-join', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const teamId = req.params.teamId as string;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { boss: true },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    // Check existing membership
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId,
          workerId: req.user!.id,
        },
      },
    });

    if (member && member.status === 'ACTIVE') {
      return res.status(400).json({ error: 'You are already a member of this team.' });
    }

    // Check existing pending request
    const existingInvite = await prisma.teamInvitation.findFirst({
      where: {
        teamId,
        workerId: req.user!.id,
        status: 'PENDING',
      },
    });

    if (existingInvite) {
      return res.status(400).json({ error: 'You already have a pending request or invitation for this team.' });
    }

    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId,
        workerId: req.user!.id,
        type: 'WORKER_REQUEST',
        message: req.body.message || 'Worker requested to join the team.',
      },
    });

    // Notify Boss
    await createNotification({
      data: {
        userId: team.bossId,
        teamId: team.id,
        type: 'INVITATION',
        title: 'New Join Request',
        message: `${req.user!.username} requested to join your team "${team.name}".`,
        linkUrl: '/boss/workers',
        referenceType: 'invitation', referenceId: invitation.id,
      },
    });

    return res.status(201).json({ message: 'Join request submitted to the Boss.', invitation });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to request joining team.' });
  }
});

/**
 * GET /api/teams/invitations (Worker sees invitations sent to them)
 */
teamRouter.get('/invitations', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const invitations = await prisma.teamInvitation.findMany({
      where: {
        workerId: req.user!.id,
        status: 'PENDING',
        type: 'BOSS_INVITE',
      },
      include: {
        team: {
          include: {
            boss: {
              select: { id: true, fullName: true, username: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(invitations);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load invitations.' });
  }
});

/**
 * POST /api/teams/invitations/:invitationId/respond (Worker accepts or declines Boss invite)
 */
teamRouter.post('/invitations/:invitationId/respond', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const invitationId = req.params.invitationId as string;
    const { action } = RespondInvitationSchema.parse(req.body);

    const invite = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
      include: { team: true },
    });

    if (!invite || invite.workerId !== req.user!.id) {
      return res.status(404).json({ error: 'Invitation not found or unauthorized.' });
    }

    if (invite.status !== 'PENDING' || invite.type !== 'BOSS_INVITE') {
      return res.status(400).json({ error: 'This invitation has already been processed.' });
    }

    const existingMembership = await prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId: invite.teamId, workerId: req.user!.id } } });
    if (existingMembership?.status === 'ACTIVE') return res.status(409).json({ error: 'You are already an active member of this team.' });

    if (action === 'ACCEPT') {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.teamInvitation.update({
          where: { id: invitationId },
          data: { status: 'ACCEPTED' },
        });

        await tx.teamMember.upsert({
          where: {
            teamId_workerId: {
              teamId: invite.teamId,
              workerId: req.user!.id,
            },
          },
          create: {
            teamId: invite.teamId,
            workerId: req.user!.id,
            status: 'ACTIVE',
          },
          update: {
            status: 'ACTIVE',
          },
        });

        // Notify Boss
        return tx.notification.create({
          data: {
            userId: invite.team.bossId,
            teamId: invite.teamId,
            type: 'INVITATION',
            title: 'Invitation Accepted',
            message: `${req.user!.username} joined your team "${invite.team.name}".`,
            linkUrl: '/boss/workers',
            referenceType: 'invitation', referenceId: invitationId,
          },
        });
      });
      await sendNotificationPush(notification.id);

      return res.json({ message: 'You have joined the team successfully!' });
    } else {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.teamInvitation.update({ where: { id: invitationId }, data: { status: 'REJECTED' } });
        return tx.notification.create({ data: {
          userId: invite.team.bossId, teamId: invite.teamId, type: 'INVITATION',
          title: 'Team invitation declined', message: `${req.user!.username} declined the invitation to ${invite.team.name}.`,
          linkUrl: '/teams', referenceType: 'invitation', referenceId: invitationId,
        } });
      });
      await sendNotificationPush(notification.id);
      return res.json({ message: 'Invitation declined.' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to process invitation.' });
  }
});

/**
 * POST /api/teams/my-team/join-requests/:invitationId/respond (Boss accepts or rejects Worker request)
 */
teamRouter.post('/my-team/join-requests/:invitationId/respond', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const invitationId = req.params.invitationId as string;
    const { action } = RespondInvitationSchema.parse(req.body);

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const invite = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
      include: { worker: true },
    });

    if (!invite || invite.teamId !== team.id) {
      return res.status(404).json({ error: 'Join request not found.' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request has already been processed.' });
    }

    if (action === 'ACCEPT') {
      const notification = await prisma.$transaction(async (tx) => {
        await tx.teamInvitation.update({
          where: { id: invitationId },
          data: { status: 'ACCEPTED' },
        });

        await tx.teamMember.upsert({
          where: {
            teamId_workerId: {
              teamId: team.id,
              workerId: invite.workerId,
            },
          },
          create: {
            teamId: team.id,
            workerId: invite.workerId,
            status: 'ACTIVE',
          },
          update: {
            status: 'ACTIVE',
          },
        });

        // Notify Worker
        return tx.notification.create({
          data: {
            userId: invite.workerId,
            teamId: team.id,
            type: 'INVITATION',
            title: 'Join Request Approved!',
            message: `Boss ${req.user!.username} approved your request to join "${team.name}".`,
            linkUrl: '/worker/teams',
            referenceType: 'invitation', referenceId: invitationId,
          },
        });
      });
      await sendNotificationPush(notification.id);

      return res.json({ message: `${invite.worker.fullName} is now an active member of your team.` });
    } else {
      await prisma.teamInvitation.update({
        where: { id: invitationId },
        data: { status: 'REJECTED' },
      });

      // Notify Worker
      await createNotification({
        data: {
          userId: invite.workerId,
          teamId: team.id,
          type: 'INVITATION',
          title: 'Join Request Declined',
          message: `Your request to join "${team.name}" was declined.`,
          linkUrl: '/worker/teams',
          referenceType: 'invitation', referenceId: invitationId,
        },
      });

      return res.json({ message: 'Join request rejected.' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to process join request.' });
  }
});

/**
 * DELETE /api/teams/my-team/members/:workerId (Boss removes or suspends worker)
 */
teamRouter.delete('/my-team/members/:workerId', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const workerId = req.params.workerId as string;
    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId: team.id,
          workerId,
        },
      },
      include: { worker: true },
    });

    if (!member) {
      return res.status(404).json({ error: 'Worker is not a member of this team.' });
    }

    // Set status to LEFT rather than deleting to preserve historical records
    await prisma.teamMember.update({
      where: { id: member.id },
      data: { status: 'LEFT' },
    });

    await createNotification({
      data: {
        userId: workerId,
        teamId: team.id,
        type: 'INVITATION',
        title: 'Team Membership Updated',
        message: `You have been removed from team "${team.name}".`,
        linkUrl: '/worker/teams',
        referenceType: 'team', referenceId: team.id,
      },
    });

    return res.json({ message: `${member.worker.fullName} removed from team.` });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove worker.' });
  }
});

/**
 * POST /api/teams/:teamId/leave (Worker voluntarily leaves a team)
 */
teamRouter.post('/:teamId/leave', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const teamId = req.params.teamId as string;

    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId,
          workerId: req.user!.id,
        },
      },
      include: { team: true },
    });

    if (!member || member.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'You are not an active member of this team.' });
    }

    await prisma.teamMember.update({
      where: { id: member.id },
      data: { status: 'LEFT' },
    });

    // Notify Boss
    await createNotification({
      data: {
        userId: member.team.bossId,
        teamId,
        type: 'INVITATION',
        title: 'Worker Left Team',
        message: `${req.user!.username} has left team "${member.team.name}".`,
        linkUrl: '/boss/workers',
        referenceType: 'team', referenceId: teamId,
      },
    });

    return res.json({ message: `You have left team "${member.team.name}".` });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to leave team.' });
  }
});

/**
 * PUT /api/teams/my-team/salary-brackets (Boss updates team salary brackets)
 */
teamRouter.put('/my-team/salary-brackets', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const { brackets } = UpdateSalaryBracketsSchema.parse(req.body);

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    // Replace brackets in transaction
    await prisma.$transaction(async (tx) => {
      await tx.salaryBracket.deleteMany({
        where: { teamId: team.id },
      });

      await tx.salaryBracket.createMany({
        data: brackets.map((b) => ({
          teamId: team.id,
          minAge: b.minAge,
          maxAge: b.maxAge,
          hourlyRate: new Prisma.Decimal(b.hourlyRate.toFixed(2)),
        })),
      });
    });

    const updated = await prisma.salaryBracket.findMany({
      where: { teamId: team.id },
      orderBy: { minAge: 'asc' },
    });

    return res.json({ message: 'Salary brackets updated successfully.', salaryBrackets: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to update salary brackets.' });
  }
});
