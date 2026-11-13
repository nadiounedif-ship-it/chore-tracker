export type UserRole = 'BOSS' | 'WORKER';

export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;
  emailVerified?: boolean;
  emailNotificationPreferences?: { enabled: boolean; categories: string[] };
  ownedTeam?: Team | null;
  teamMemberships?: TeamMember[];
}

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  paymentSchedule: 'WEEKLY_SUNDAY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';
  customPaymentIntervalDays?: number | null;
  customPaymentDay?: number | null;
  nextPaymentDate?: string;
  bossId: string;
  boss?: User;
  members?: TeamMember[];
  createdAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  team?: Team;
  workerId: string;
  worker?: User;
  status: 'ACTIVE' | 'SUSPENDED' | 'LEFT';
  joinedAt: string;
}

export interface SalaryBracket {
  id: string;
  teamId: string;
  minAge: number;
  maxAge: number;
  hourlyRate: string; // Decimal string e.g. "3.50"
}

export type ChoreCategory =
  | 'CLEANING'
  | 'GARDENING'
  | 'COOKING'
  | 'ORGANISATION'
  | 'LAUNDRY'
  | 'SHOPPING'
  | 'MAINTENANCE'
  | 'OTHER';

export type PaymentType = 'FIXED' | 'HOURLY';
export type ChorePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ChoreStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Chore {
  id: string;
  teamId: string;
  team?: Team;
  title: string;
  description: string;
  instructions?: string | null;
  category: ChoreCategory;
  priority: ChorePriority;
  paymentType: PaymentType;
  fixedAmount: string; // e.g. "2.00"
  estimatedDurationMinutes?: number | null;
  weekNumber: number;
  year: number;
  deadline?: string | null;
  requestDeadline?: string | null;
  requiresBeforeAfterPictures: boolean;
  requiresNfc: boolean;
  allowMultipleWorkers: boolean;
  status: ChoreStatus;
  pictures: string[];
  assignments?: ChoreAssignment[];
  createdAt: string;
}

export interface ChoreAssignment {
  id: string;
  choreId: string;
  chore?: Chore;
  workerId: string;
  worker?: User;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  requestedAt: string;
  approvedAt?: string | null;
  completedAt?: string | null;
  sessions?: ChoreSession[];
}

export interface ChoreSession {
  id: string;
  assignmentId: string;
  workerId: string;
  worker?: User;
  teamId: string;
  team?: Team;
  clockInAt: string;
  clockOutAt?: string | null;
  durationSeconds?: number | null;
  clockInMethod: 'NFC' | 'QR' | 'MANUAL' | 'REMOTE';
  clockOutMethod?: 'NFC' | 'QR' | 'MANUAL' | 'REMOTE' | null;
  isRemote: boolean;
  beforePictureUrl?: string | null;
  afterPictureUrl?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  workerAgeAtWork?: number | null;
  hourlyRateApplied?: string | null;
  finalAmount: string;
  status: 'ACTIVE' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  approvedAt?: string | null;
}

export interface PiggyBankTransaction {
  id: string;
  workerId: string;
  teamId: string;
  team?: Team;
  teamName?: string;
  amount: string; // e.g. "3.50" or "-10.00"
  type: 'EARNING' | 'PAYOUT' | 'ADJUSTMENT';
  description: string;
  createdAt: string;
}

export interface PiggyBankSummary {
  totalUnpaid: string;
  totalEarned: string;
  totalPaid: string;
  byTeam: {
    teamId: string;
    teamName: string;
    bossName: string;
    earned: string;
    unpaid: string;
    paid: string;
  }[];
  recentTransactions: PiggyBankTransaction[];
}
