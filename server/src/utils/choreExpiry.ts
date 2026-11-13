import { prisma } from '../prisma.js';

export async function expireUnstartedApprovals() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const expired = await prisma.choreAssignment.findMany({ where: { status: 'APPROVED', approvedAt: { lte: cutoff } }, select: { id: true, choreId: true } });
  for (const assignment of expired) {
    await prisma.$transaction(async (tx) => {
      if (await tx.choreSession.findFirst({ where: { assignmentId: assignment.id, status: 'ACTIVE' }, select: { id: true } })) return;
      const changed = await tx.choreAssignment.updateMany({ where: { id: assignment.id, status: 'APPROVED', approvedAt: { lte: cutoff } }, data: { status: 'CANCELLED' } });
      if (!changed.count) return;
      const remaining = await tx.choreAssignment.count({ where: { choreId: assignment.choreId, status: { in: ['APPROVED', 'ACTIVE'] } } });
      if (!remaining) await tx.chore.updateMany({ where: { id: assignment.choreId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, data: { status: 'OPEN' } });
    });
  }
}
