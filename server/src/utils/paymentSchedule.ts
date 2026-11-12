export function getNextPaymentDate(schedule: string, intervalDays: number | null, paymentDay: number | null, from = new Date()) {
  const next = new Date(from);
  next.setHours(12, 0, 0, 0);
  if (schedule === 'WEEKLY_SUNDAY') next.setDate(next.getDate() + (7 - next.getDay() || 7));
  else if (schedule === 'BIWEEKLY') next.setDate(next.getDate() + 14);
  else if (schedule === 'MONTHLY') { next.setDate(1); next.setMonth(next.getMonth() + 1); }
  else if (paymentDay) {
    const today = next.getDate();
    next.setDate(1);
    if (today >= paymentDay) next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(paymentDay, 28));
  } else next.setDate(next.getDate() + (intervalDays || 7));
  return next;
}

export function getPeriodStart(schedule: string, intervalDays: number | null, paymentDay: number | null, end: Date) {
  const start = new Date(end);
  if (schedule === 'WEEKLY_SUNDAY') start.setDate(start.getDate() - 7);
  else if (schedule === 'BIWEEKLY') start.setDate(start.getDate() - 14);
  else if (schedule === 'MONTHLY') start.setMonth(start.getMonth() - 1);
  else if (intervalDays) start.setDate(start.getDate() - intervalDays);
  else start.setDate(start.getDate() - 30);
  if (paymentDay && schedule === 'CUSTOM') start.setDate(1);
  return start;
}
