import { Prisma } from '@prisma/client';

/**
 * Rounds a number or string amount in Euros UP to 2 decimal places (2 digits after the comma).
 * For example: 1.451 becomes 1.46, 2.500 becomes 2.50.
 */
export function roundUpEuro(amount: number | string | Prisma.Decimal): Prisma.Decimal {
  const num = typeof amount === 'number' 
    ? amount 
    : typeof amount === 'string' 
      ? parseFloat(amount) 
      : amount.toNumber();

  if (isNaN(num)) {
    return new Prisma.Decimal('0.00');
  }

  // Multiply by 100, ceil to next integer cent, then divide by 100
  const ceiled = Math.ceil(num * 100) / 100;
  return new Prisma.Decimal(ceiled.toFixed(2));
}

/**
 * Calculates time-based earnings in Euros given duration in seconds and hourly rate.
 * Rounds UP to 2 digits after the comma.
 */
export function calculateHourlyEarnings(
  durationSeconds: number,
  hourlyRate: Prisma.Decimal | number | string
): Prisma.Decimal {
  const rate = typeof hourlyRate === 'number' 
    ? hourlyRate 
    : typeof hourlyRate === 'string' 
      ? parseFloat(hourlyRate) 
      : hourlyRate.toNumber();

  const hours = Math.max(0, durationSeconds) / 3600;
  const rawEarnings = hours * rate;

  return roundUpEuro(rawEarnings);
}

/**
 * Format a Decimal or number as European currency string (e.g. "12,50 €")
 */
export function formatEuro(amount: Prisma.Decimal | number | string): string {
  const num = typeof amount === 'number' 
    ? amount 
    : typeof amount === 'string' 
      ? parseFloat(amount) 
      : amount.toNumber();

  if (isNaN(num)) return '0,00 €';
  return `${num.toFixed(2).replace('.', ',')} €`;
}
