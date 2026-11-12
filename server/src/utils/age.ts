/**
 * Calculate exact integer age in years from a date of birth relative to an effective date.
 * If effectiveDate is omitted, current date/time is used.
 */
export function calculateAge(dateOfBirth: Date | string, effectiveDate: Date = new Date()): number {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  let age = effectiveDate.getFullYear() - dob.getFullYear();
  const m = effectiveDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && effectiveDate.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
}
