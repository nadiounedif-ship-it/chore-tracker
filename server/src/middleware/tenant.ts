import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma.js';

/**
 * Ensures the authenticated user is the Boss owning the specified team.
 */
export async function requireTeamBoss(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role !== 'BOSS') {
    return res.status(403).json({ error: 'Only a Boss can perform this action.' });
  }

  const teamId = req.params.teamId || req.body.teamId || req.query.teamId;

  if (!teamId) {
    return res.status(400).json({ error: 'Team ID is required.' });
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id: String(teamId) },
      select: { id: true, bossId: true },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    if (team.bossId !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to manage this team.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify team authorization.' });
  }
}

/**
 * Ensures the authenticated user is either the Boss of the team or an active Worker member.
 */
export async function requireTeamAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const teamId = req.params.teamId || req.body.teamId || req.query.teamId;

  if (!teamId) {
    return res.status(400).json({ error: 'Team ID is required.' });
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id: String(teamId) },
      select: {
        id: true,
        bossId: true,
        members: {
          where: {
            workerId: req.user.id,
            status: 'ACTIVE',
          },
          select: { id: true },
        },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const isBoss = team.bossId === req.user.id;
    const isMember = team.members.length > 0;

    if (!isBoss && !isMember) {
      return res.status(403).json({ error: 'You do not have access to this team.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify team access.' });
  }
}
