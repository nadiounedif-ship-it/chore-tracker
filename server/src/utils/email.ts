import { config } from '../config.js';

export async function sendEmail(to: string, subject: string, html: string, idempotencyKey?: string) {
  if (!config.resendApiKey) {
    console.warn('[Email] RESEND_API_KEY is not configured; delivery skipped.');
    return false;
  }
  if (!config.emailFrom) {
    console.warn('[Email] EMAIL_FROM is not configured; delivery skipped.');
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject, html }),
    });
    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 1000);
      console.error('[Email] Delivery failed:', response.status, providerMessage || '(provider returned no details)');
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Email] Delivery unavailable:', error instanceof Error ? error.message : 'unknown error');
    return false;
  }
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
