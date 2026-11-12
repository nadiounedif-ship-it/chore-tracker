/// <reference types="vite/client" />
import {
  User,
  Team,
  Chore,
  ChoreAssignment,
  ChoreSession,
  PiggyBankSummary,
  PiggyBankTransaction,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://chore-tracker-backend-m2v3.onrender.com/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Authentication
  auth: {
    me: () => request<User>('/auth/me'),
    login: (identifier: string, password: string) =>
      request<{ message: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }),
    registerBoss: (data: any) =>
      request<{ message: string; user: User }>('/auth/register-boss', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    registerWorker: (data: any) =>
      request<{ message: string; user: User }>('/auth/register-worker', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
    updateProfile: (data: any) =>
      request<{ message: string; user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    updatePassword: (currentPassword: string, newPassword: string) =>
      request<{ message: string }>('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
    changeEmail: (email: string, password: string) =>
      request<{ message: string }>('/auth/email/change', { method: 'POST', body: JSON.stringify({ email, password }) }),
    verifyEmail: (token: string) => request<{ message: string }>('/auth/email/verify', { method: 'POST', body: JSON.stringify({ token }) }),
    updateNotificationPreferences: (preferences: { enabled: boolean; categories: string[] }) =>
      request<{ emailNotificationPreferences: any }>('/auth/notification-preferences', { method: 'PUT', body: JSON.stringify(preferences) }),
  },

  // Teams
  teams: {
    getMyTeam: () => request<Team & { members: any[]; salaryBrackets: any[]; invitations: any[] }>('/teams/my-team'),
    savePaymentSettings: (data: any) => request<any>('/teams/my-team/payment-settings', { method: 'PUT', body: JSON.stringify(data) }),
    cancelInvitation: (id: string) => request<any>(`/teams/my-team/invitations/${id}`, { method: 'DELETE' }),
    getMyTeams: () => request<any[]>('/teams/my-teams'),
    updateMyTeam: (data: any) => request<{ message: string; team: Team }>('/teams/my-team', { method: 'PUT', body: JSON.stringify(data) }),
    searchWorkers: (q: string) => request<any[]>(`/teams/search-workers?q=${encodeURIComponent(q)}`),
    inviteWorker: (workerIdentifier: string, message?: string) =>
      request<any>('/teams/invite-worker', { method: 'POST', body: JSON.stringify({ workerIdentifier, message }) }),
    searchTeams: (q: string = '') => request<any[]>(`/teams/search-teams?q=${encodeURIComponent(q)}`),
    requestJoin: (teamId: string, message?: string) =>
      request<any>(`/teams/${teamId}/request-join`, { method: 'POST', body: JSON.stringify({ message }) }),
    getInvitations: () => request<any[]>('/teams/invitations'),
    respondInvitation: (invitationId: string, action: 'ACCEPT' | 'REJECT') =>
      request<{ message: string }>(`/teams/invitations/${invitationId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    respondJoinRequest: (invitationId: string, action: 'ACCEPT' | 'REJECT') =>
      request<{ message: string }>(`/teams/my-team/join-requests/${invitationId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    removeWorker: (workerId: string) =>
      request<{ message: string }>(`/teams/my-team/members/${workerId}`, { method: 'DELETE' }),
    leaveTeam: (teamId: string) =>
      request<{ message: string }>(`/teams/${teamId}/leave`, { method: 'POST' }),
    updateSalaryBrackets: (brackets: any[]) =>
      request<{ message: string; salaryBrackets: any[] }>('/teams/my-team/salary-brackets', {
        method: 'PUT',
        body: JSON.stringify({ brackets }),
      }),
  },

  // Chores
  chores: {
    create: (data: any) => request<{ message: string; chore: Chore }>('/chores', { method: 'POST', body: JSON.stringify(data) }),
    getMyTeamChores: (params?: { week?: number; year?: number; status?: string; category?: string }) => {
      const q = new URLSearchParams(params as any).toString();
      return request<Chore[]>(`/chores/my-team${q ? `?${q}` : ''}`);
    },
    getAvailable: (teamId?: string) =>
      request<Chore[]>(`/chores/available${teamId ? `?teamId=${teamId}` : ''}`),
    requestChore: (choreId: string) =>
      request<{ message: string; assignment: ChoreAssignment }>(`/chores/${choreId}/request`, { method: 'POST' }),
    respondChoreRequest: (assignmentId: string, action: 'APPROVE' | 'REJECT') =>
      request<{ message: string }>(`/chores/requests/${assignmentId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    getMyAssignments: (status?: string, teamId?: string) => {
      const q = new URLSearchParams();
      if (status) q.append('status', status);
      if (teamId) q.append('teamId', teamId);
      return request<ChoreAssignment[]>(`/chores/my-assignments${q.toString() ? `?${q.toString()}` : ''}`);
    },
    cancelChore: (choreId: string) =>
      request<{ message: string }>(`/chores/${choreId}`, { method: 'DELETE' }),
  },

  // Sessions & Time Tracking
  sessions: {
    getQrBadge: () => request<{ badgeUid: string; worker: any; qrDataUrl: string }>('/sessions/qr/badge'),
    linkNfcBadge: (badgeUid: string, label?: string, workerId?: string) =>
      request<{ message: string; badge: any }>('/sessions/nfc/link', {
        method: 'POST',
        body: JSON.stringify({ badgeUid, label, workerId }),
      }),
    reassignBadge: (badgeUid: string, workerId: string) => request<{ message: string }>('/sessions/nfc/reassign', { method: 'POST', body: JSON.stringify({ badgeUid, workerId }) }),
    identifyBadge: (badgeUid: string, proof?: string, issuedAt?: number) => request<any>(`/sessions/identify/${encodeURIComponent(badgeUid)}?${new URLSearchParams({ ...(proof ? { proof } : {}), ...(issuedAt ? { issuedAt: String(issuedAt) } : {}) })}`),
    clockIn: (badgeUid: string, choreId: string, method: 'NFC' | 'QR' | 'MANUAL' = 'NFC', proof?: string, issuedAt?: number) =>
      request<any>('/sessions/clock-in', {
        method: 'POST',
        body: JSON.stringify({ badgeUid, choreId, method, proof, issuedAt }),
      }),
    clockOut: (badgeUid: string, notes?: string, method: 'NFC' | 'QR' | 'MANUAL' = 'NFC', proof?: string, issuedAt?: number) =>
      request<any>('/sessions/clock-out', {
        method: 'POST',
        body: JSON.stringify({ badgeUid, notes, method, proof, issuedAt }),
      }),
    remoteStart: (assignmentId: string, beforePictureUrl?: string, notes?: string) =>
      request<{ message: string; session: ChoreSession }>('/sessions/remote/start', {
        method: 'POST',
        body: JSON.stringify({ assignmentId, beforePictureUrl, notes }),
      }),
    remoteSubmit: (sessionId: string, afterPictureUrl?: string, notes?: string) =>
      request<{ message: string; session: ChoreSession }>('/sessions/remote/submit', {
        method: 'POST',
        body: JSON.stringify({ sessionId, afterPictureUrl, notes }),
      }),
    reviewSession: (sessionId: string, approved: boolean, rejectionReason?: string) =>
      request<{ message: string }>(`/sessions/${sessionId}/review`, {
        method: 'POST',
        body: JSON.stringify({ approved, rejectionReason }),
      }),
    getActive: () => request<any>('/sessions/active'),
  },

  // Piggy Bank & Finances
  piggybank: {
    getOverview: (teamId?: string) =>
      request<PiggyBankSummary>(`/piggybank/overview${teamId ? `?teamId=${teamId}` : ''}`),
    getTeamFinances: () =>
      request<{
        teamName: string;
        totalEarned: string;
        totalPaid: string;
        totalUnpaid: string;
        workers: any[];
        recentTransactions: PiggyBankTransaction[];
      }>('/piggybank/team'),
    payWorker: (workerId: string, amount: number, notes?: string) =>
      request<{ message: string; payment: any; transaction: any }>('/piggybank/pay', {
        method: 'POST',
        body: JSON.stringify({ workerId, amount, notes }),
      }),
  },

  // Shopping / To Buy List
  shopping: {
    createRequest: (data: any) =>
      request<{ message: string; item: any }>('/shopping', { method: 'POST', body: JSON.stringify(data) }),
    list: (teamId?: string) =>
      request<any[]>(`/shopping${teamId ? `?teamId=${teamId}` : ''}`),
    updateStatus: (id: string, status: 'APPROVED' | 'PURCHASED' | 'REJECTED') =>
      request<{ message: string; item: any }>(`/shopping/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
  },

  // Savings Goals
  savings: {
    list: () => request<any[]>('/savings'),
    create: (name: string, targetAmount: number, pictureUrl?: string) =>
      request<{ message: string; goal: any }>('/savings', {
        method: 'POST',
        body: JSON.stringify({ name, targetAmount, pictureUrl }),
      }),
    update: (id: string, name: string, targetAmount: number, pictureUrl?: string) =>
      request<{ message: string; goal: any }>(`/savings/${id}`, { method: 'PUT', body: JSON.stringify({ name, targetAmount, pictureUrl }) }),
    delete: (id: string) => request<{ message: string }>(`/savings/${id}`, { method: 'DELETE' }),
  },

  // Notifications
  notifications: {
    list: () => request<{ notifications: any[]; unreadCount: number }>('/notifications'),
    markRead: (id: string) => request<{ message: string }>(`/notifications/${id}/read`, { method: 'PUT' }),
    markAllRead: () => request<{ message: string }>('/notifications/read-all', { method: 'PUT' }),
  },

  // Photo Upload
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch(`${BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Photo upload failed');
    const result = await res.json() as { url: string; filename: string };
    return { ...result, url: new URL(result.url, BASE_URL).toString() };
  },
};
