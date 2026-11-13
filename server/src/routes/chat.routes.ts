import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';

export const chatRouter = Router();
const MessageSchema = z.object({ message: z.string().trim().min(1).max(2000) });

async function canAccessTeam(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { bossId: true } });
  if (!team) return false;
  if (team.bossId === userId) return true;
  const member = await prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId, workerId: userId } }, select: { status: true } });
  return member?.status === 'ACTIVE';
}

chatRouter.get('/teams/:teamId/messages', authenticate, async (req: Request, res: Response) => {
  const teamId = req.params.teamId as string;
  if (!await canAccessTeam(teamId, req.user!.id)) return res.status(403).json({ error: 'You are not an active member of this team.' });
  const messages = await prisma.teamMessage.findMany({ where: { teamId }, include: { sender: { select: { id: true, fullName: true, username: true, avatarUrl: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(messages.reverse());
});

chatRouter.post('/teams/:teamId/messages', authenticate, async (req: Request, res: Response) => {
  const teamId = req.params.teamId as string;
  const parsed = MessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Messages must be between 1 and 2000 characters.' });
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, bossId: true, members: { where: { status: 'ACTIVE' }, select: { workerId: true } } } });
  if (!team || (team.bossId !== req.user!.id && !team.members.some((member) => member.workerId === req.user!.id))) return res.status(403).json({ error: 'You are not an active member of this team.' });
  const message = await prisma.teamMessage.create({ data: { teamId, senderId: req.user!.id, message: parsed.data.message }, include: { sender: { select: { id: true, fullName: true, username: true, avatarUrl: true } } } });
  const recipients = [...new Set([team.bossId, ...team.members.map((member) => member.workerId)])].filter((userId) => userId !== req.user!.id);
  await Promise.allSettled(recipients.map((userId) => createNotification({ data: {
    userId,
    teamId,
    type: 'TEAM_CHAT',
    title: `New message in ${team.name}`,
    message: `${message.sender.fullName}: ${message.message}`,
    linkUrl: `/dashboard/chat?teamId=${teamId}`,
    referenceType: 'team-message',
    referenceId: message.id,
  } })));
  res.status(201).json(message);
});
