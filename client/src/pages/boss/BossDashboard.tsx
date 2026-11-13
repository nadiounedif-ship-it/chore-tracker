import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { formatCurrency } from '../../lib/utils';
import {
  Users,
  CheckCircle2,
  Clock,
  Euro,
  Plus,
  QrCode,
  Radio,
  AlertCircle,
  Eye,
  Calendar,
  Send,
  Trash2,
  Sparkles,
  Image as ImageIcon,
  Edit2,
  X,
  Upload,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { TeamChat } from '../../components/TeamChat';
import { DeadlineTimer } from '../../components/DeadlineTimer';
import { UserAvatar } from '../../components/UserAvatar';

export const BossDashboard: React.FC = () => {
  const { user, dashboardTab, setDashboardTab } = useAuth();
  const queryClient = useQueryClient();

  // Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'chores' | 'scanner' | 'payouts' | 'workers' | 'rates' | 'shopping' | 'chat'>('overview');

  // Modals
  const [showCreateChore, setShowCreateChore] = useState(false);
  const [showInviteWorker, setShowInviteWorker] = useState(false);
  const [showEditRates, setShowEditRates] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);

  // Queries
  const { data: teamData, isLoading: loadingTeam } = useQuery({
    queryKey: ['myTeam'],
    queryFn: () => api.teams.getMyTeam(),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (dashboardTab && ['overview', 'chores', 'scanner', 'payouts', 'workers', 'rates', 'shopping', 'chat'].includes(dashboardTab)) {
      setActiveTab(dashboardTab as any);
      setDashboardTab(null);
    }
  }, [dashboardTab, setDashboardTab]);

  const { data: choresData } = useQuery({
    queryKey: ['myTeamChores'],
    queryFn: () => api.chores.getMyTeamChores(),
  });

  const { data: financeData } = useQuery({
    queryKey: ['teamFinances'],
    queryFn: () => api.piggybank.getTeamFinances(),
    refetchInterval: 30000,
  });

  const { data: activeSessions } = useQuery({
    queryKey: ['activeSessions'],
    queryFn: () => api.sessions.getActive(),
    refetchInterval: 5000,
  });
  const { data: shoppingItems } = useQuery({ queryKey: ['bossShopping'], queryFn: () => api.shopping.list(), enabled: activeTab === 'shopping' });

  // Scanner & Clock-in Form State
  const [scannedUid, setScannedUid] = useState('');
  const [badgeProof, setBadgeProof] = useState<string>();
  const [badgeIssuedAt, setBadgeIssuedAt] = useState<number>();
  const [scanMethod, setScanMethod] = useState<'NFC' | 'QR' | 'MANUAL'>('MANUAL');
  const [identifiedWorker, setIdentifiedWorker] = useState<any>(null);
  const [nfcError, setNfcError] = useState('');
  const [cameraScanning, setCameraScanning] = useState(false);
  const nfcController = useRef<AbortController | null>(null);
  const qrReader = useRef<Html5Qrcode | null>(null);
  const [selectedChoreId, setSelectedChoreId] = useState('');
  const [clockMessage, setClockMessage] = useState<string | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);

  // Mutations
  const clockInMutation = useMutation({
    mutationFn: () => api.sessions.clockIn(scannedUid, selectedChoreId, scanMethod, badgeProof, badgeIssuedAt),
    onSuccess: (res) => {
      setClockMessage(res.message);
      setClockError(null);
      setScannedUid('');
      setIdentifiedWorker(null);
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      queryClient.invalidateQueries({ queryKey: ['myTeamChores'] });
    },
    onError: (err: any) => {
      setClockError(err.message);
      setClockMessage(null);
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: () => api.sessions.clockOut(scannedUid, undefined, scanMethod, badgeProof, badgeIssuedAt),
    onSuccess: (res) => {
      setClockMessage(res.message);
      setClockError(null);
      setScannedUid('');
      setIdentifiedWorker(null);
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
      queryClient.invalidateQueries({ queryKey: ['teamFinances'] });
      queryClient.invalidateQueries({ queryKey: ['myTeamChores'] });
    },
    onError: (err: any) => {
      setClockError(err.message);
      setClockMessage(null);
    },
  });

  const identifyMutation = useMutation({
    mutationFn: () => api.sessions.identifyBadge(scannedUid, badgeProof, badgeIssuedAt),
    onSuccess: (result) => {
      setIdentifiedWorker(result);
      setClockError('');
      setClockMessage('Worker verified for your team. Review the chore and confirm the action.');
      if (result.assignments?.length === 1) setSelectedChoreId(result.assignments[0].chore.id);
    },
    onError: (err: any) => { setIdentifiedWorker(null); setClockError(err.message); },
  });

  const startNfcScan = async () => {
    setNfcError('');
    if (!('NDEFReader' in window)) { setNfcError('NFC scanning requires a compatible Android phone, Chrome, and a secure HTTPS connection. Use QR scanning or enter the badge code instead.'); return; }
    try {
      const controller = new AbortController(); nfcController.current = controller;
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal: controller.signal });
      reader.onreading = (event: any) => {
        if (!event.serialNumber) { setNfcError('This NFC tag did not provide a readable serial number.'); return; }
        setScannedUid(String(event.serialNumber).toUpperCase()); setBadgeProof(undefined); setBadgeIssuedAt(undefined); setScanMethod('NFC');
        controller.abort(); nfcController.current = null; setNfcError('');
      };
    } catch (err: any) { setNfcError(err.message || 'Could not start NFC scanning. Check browser permission and NFC settings.'); }
  };

  useEffect(() => {
    if (!cameraScanning) return;
    const reader = new Html5Qrcode('boss-qr-reader'); qrReader.current = reader;
    reader.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (decoded) => {
      try {
        const payload = JSON.parse(decoded);
        if (payload.type !== 'CHORE_MANAGER_BADGE' || !payload.badgeUid) throw new Error('This is not a Chore Manager badge.');
        setScannedUid(payload.badgeUid); setBadgeProof(payload.proof); setBadgeIssuedAt(payload.issuedAt); setScanMethod('QR'); setCameraScanning(false);
      } catch (err: any) { setClockError(err.message || 'Could not read this badge.'); setCameraScanning(false); }
    }, () => {}).catch((err) => { setClockError(`Camera could not start: ${err}`); setCameraScanning(false); });
    return () => {
      const activeReader = qrReader.current;
      qrReader.current = null;
      if (!activeReader) return;
      const stopCamera = activeReader.isScanning ? activeReader.stop().catch(() => {}) : Promise.resolve();
      void stopCamera.then(() => activeReader.clear()).catch(() => {});
    };
  }, [cameraScanning]);

  useEffect(() => () => { nfcController.current?.abort(); }, []);

  const reviewSessionMutation = useMutation({
    mutationFn: ({ id, approved, reason }: { id: string; approved: boolean; reason?: string }) =>
      api.sessions.reviewSession(id, approved, reason),
    onSuccess: () => {
      setSelectedSubmission(null);
      queryClient.invalidateQueries({ queryKey: ['myTeamChores'] });
      queryClient.invalidateQueries({ queryKey: ['teamFinances'] });
    },
  });

  const payWorkerMutation = useMutation({
    mutationFn: ({ workerId, amount }: { workerId: string; amount: number }) =>
      api.piggybank.payWorker(workerId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamFinances'] });
    },
  });

  const deleteChoreMutation = useMutation({
    mutationFn: (choreId: string) => api.chores.cancelChore(choreId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['myTeamChores'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete chore.');
    },
  });
  const respondRequestMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) => api.chores.respondChoreRequest(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myTeamChores'] }),
  });
  const shoppingStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'PURCHASED' | 'REJECTED' }) => api.shopping.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bossShopping'] }),
  });
  const removeWorkerMutation = useMutation({
    mutationFn: (workerId: string) => api.teams.removeWorker(workerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myTeam'] }),
    onError: (error: any) => alert(error.message || 'Could not remove this worker from the team.'),
  });

  // Calculate Metrics
  const activeMembersCount = teamData?.members?.filter((m) => m.status === 'ACTIVE').length || 0;
  const pendingRequests = choresData?.flatMap((chore) => (chore.assignments || []).filter((a) => a.status === 'REQUESTED').map((a) => ({ ...a, choreTitle: chore.title, choreId: chore.id }))) || [];
  const completedAssignments = (choresData?.flatMap((chore) => (chore.assignments || []).filter((assignment) => assignment.status === 'COMPLETED').map((assignment) => ({ id: assignment.id, choreId: chore.id, choreTitle: chore.title, workerName: assignment.worker?.fullName || 'Worker', completedAt: assignment.completedAt }))) || []).sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  const availableBossChores = (choresData || []).filter((chore) => ['OPEN', 'ASSIGNED'].includes(chore.status) && !['ASSIGNED', 'ACTIVE'].includes(chore.assignments?.[0]?.status || '') && (!chore.requestDeadline || new Date(chore.requestDeadline) > new Date()));
  const inProgressBossChores = (choresData || []).filter((chore) => ['IN_PROGRESS', 'ASSIGNED'].includes(chore.status) && chore.assignments?.some((a) => ['APPROVED', 'ACTIVE'].includes(a.status)));
  const unattributedBossChores = (choresData || []).filter((chore) => chore.status !== 'COMPLETED' && !!chore.requestDeadline && new Date(chore.requestDeadline) <= new Date() && !(chore.assignments?.length));
  const awaitingReviewSessions = choresData?.flatMap((chore) => (chore.assignments || []).flatMap((a) => (a.sessions || []).filter((s: any) => s.status === 'SUBMITTED').map((s: any) => ({ ...s, choreTitle: chore.title, choreId: chore.id, workerName: a.worker?.fullName || 'Worker' })))) || [];
  const totalUnpaid = financeData?.totalUnpaid || '0.00';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Team Header Banner */}
      <div className="bg-gradient-to-r from-amber-800 via-orange-700 to-rose-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-purple-500/30 text-purple-200 border border-purple-400/30 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                👑 Boss Dashboard
              </span>
              <span className="text-purple-300 text-xs font-medium">Payment: {teamData?.paymentSchedule || 'Weekly'} · Next: {teamData?.nextPaymentDate ? new Date(teamData.nextPaymentDate).toLocaleDateString() : '—'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {teamData?.name || 'My Team'}
            </h1>
            <p className="text-purple-200 text-sm mt-1 max-w-xl">
              {teamData?.description || 'Manage team members, distribute chores, verify badges, and settle payments.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('scanner')}
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm cursor-pointer"
            >
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              NFC / QR Scanner
            </button>
            <button
              onClick={() => setShowCreateChore(true)}
              className="bg-purple-500 hover:bg-purple-600 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/30 transition-all flex items-center gap-2 text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Chore
            </button>
          </div>
        </div>
      </div>

      {activeTab !== 'overview' && <button onClick={() => setActiveTab('overview')} className="text-sm font-bold text-amber-900 hover:text-amber-950">← Home</button>}

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Active Workers</span>
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{activeMembersCount}</div>
              <p className="text-xs text-slate-400 mt-1">In your family team</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Unpaid Earnings</span>
                <Euro className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">{formatCurrency(totalUnpaid)}</div>
              <p className="text-xs text-slate-400 mt-1">Owed to workers</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Clocked In Now</span>
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {Array.isArray(activeSessions) ? activeSessions.length : 0}
              </div>
              <p className="text-xs text-slate-400 mt-1">Currently working</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Pending Reviews</span>
                <CheckCircle2 className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {pendingRequests.length + awaitingReviewSessions.length}
              </div>
              <p className="text-xs text-slate-400 mt-1">Requests & proofs</p>
            </div>
          </div>

          <section aria-label="Boss dashboard shortcuts" className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {[
              { id: 'chores', icon: '🧹', title: 'Chores & requests', detail: `${pendingRequests.length} new requests · ${choresData?.length || 0} chores` },
              { id: 'scanner', icon: '📱', title: 'Clock in / out', detail: 'Scan a worker badge' },
              { id: 'payouts', icon: '🐷', title: 'Piggy bank & payouts', detail: `${formatCurrency(totalUnpaid)} waiting to be paid` },
              { id: 'workers', icon: '👨‍👩‍👧‍👦', title: 'Workers & invitations', detail: `${activeMembersCount} active team members` },
              { id: 'rates', icon: '🌱', title: 'Salary brackets', detail: 'Review age-based rates' },
              { id: 'shopping', icon: '🛒', title: 'To Buy list', detail: 'Review family supply requests' },
            ].map((tile) => <button key={tile.id} onClick={() => setActiveTab(tile.id as any)} className="min-h-32 sm:min-h-36 rounded-2xl sm:rounded-3xl border border-orange-100 bg-white p-4 sm:p-6 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600">
              <span className="text-2xl sm:text-3xl" aria-hidden="true">{tile.icon}</span><span className="mt-3 block font-extrabold text-slate-900 text-sm sm:text-base">{tile.title}</span><span className="mt-1 block text-xs sm:text-sm text-slate-500">{tile.detail}</span>
            </button>)}
          </section>

          {/* Pending Reviews Banner if any */}
          {awaitingReviewSessions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-900 text-sm">
                    {awaitingReviewSessions.length} Chore Submission(s) Ready for Review
                  </h4>
                  <p className="text-xs text-amber-700">Workers have finished chores and uploaded completion photo proofs.</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('chores')}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Inspect Proofs
              </button>
            </div>
          )}

          {/* Active Work Sessions Live Feed */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" /> Live Working Sessions
            </h3>
            {!activeSessions || activeSessions.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No workers are currently clocked in.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeSessions.map((s: any) => (
                  <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                        {s.worker.fullName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">{s.worker.fullName}</div>
                        <div className="text-xs text-slate-500">Chore: {s.assignment?.chore?.title}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        Started: {new Date(s.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'chat' && <TeamChat teamId={teamData?.id} />}

      {/* TAB: CHORES & APPROVALS */}
      {activeTab === 'chores' && (
        <div className="space-y-6">
          {pendingRequests.length > 0 && <section className="order-first bg-amber-50 rounded-2xl border border-amber-200 p-4 sm:p-5 space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="font-bold text-base sm:text-lg text-amber-950">Chore requests</h3><span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-amber-900">{pendingRequests.length} waiting</span></div>{pendingRequests.map((request: any) => <div key={request.id} id={`reference-chore-${request.choreId}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-amber-200 pt-3"><div className="min-w-0"><div className="font-bold break-words">{request.worker?.fullName || 'Worker'} asked to do {request.choreTitle}</div><div className="text-xs text-slate-500">Requested {new Date(request.requestedAt).toLocaleDateString()}</div></div><div className="flex gap-2 shrink-0"><button disabled={respondRequestMutation.isPending} onClick={() => respondRequestMutation.mutate({ id: request.id, action: 'APPROVE' })} className="rounded-lg bg-emerald-100 text-emerald-900 px-3 py-2 text-xs font-bold">Approve</button><button disabled={respondRequestMutation.isPending} onClick={() => respondRequestMutation.mutate({ id: request.id, action: 'REJECT' })} className="rounded-lg bg-white text-rose-800 px-3 py-2 text-xs font-bold">Decline</button></div></div>)}</section>}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Team Chores</h2>
              <p className="text-xs text-slate-500">Chores organized for your family team</p>
            </div>
            <button
              onClick={() => setShowCreateChore(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" /> Create Chore
            </button>
          </div>

          <h3 className="text-lg font-extrabold text-slate-900">Available chores <span className="text-sm text-slate-500">({availableBossChores.length})</span></h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableBossChores.map((chore) => (
              <div key={chore.id} id={`reference-chore-${chore.id}`} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between overflow-hidden">
                <div>
                  {/* Chore Picture if available */}
                  {chore.pictures && chore.pictures.length > 0 && (
                    <div className="mb-3 -mx-5 -mt-5 h-36 overflow-hidden bg-slate-100 border-b border-slate-100 relative">
                      <img src={chore.pictures[0]} alt={chore.title} className="w-full h-full object-cover" />
                      {chore.pictures.length > 1 && (
                        <span className="absolute bottom-2 right-2 bg-slate-900/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                          +{chore.pictures.length - 1} photos
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                      {chore.category}
                    </span>
                    <span className="text-sm font-extrabold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-100">
                      {chore.paymentType === 'FIXED' ? formatCurrency(chore.fixedAmount) : 'Hourly Rate'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{chore.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{chore.description}</p>
                  {chore.requestDeadline && <p className="mt-2"><DeadlineTimer date={chore.requestDeadline} /></p>}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Status: <strong className="text-slate-800">{chore.status}</strong></span>
                  {chore.requiresBeforeAfterPictures && (
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold text-[10px]">
                      📷 Photos Req.
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">{chore.assignments?.some((a) => a.sessions?.length) || chore.status === 'COMPLETED' || chore.status === 'IN_PROGRESS' ? 'Work has started or finished. Its history must be preserved.' : chore.assignments?.length ? 'A worker has requested or been assigned this chore.' : ''}</span>
                  <button type="button" disabled={!!chore.assignments?.length || !['OPEN', 'CANCELLED'].includes(chore.status) || deleteChoreMutation.isPending} onClick={() => { if (window.confirm(`Delete “${chore.title}”? This cannot be undone.`)) deleteChoreMutation.mutate(chore.id); }} className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed">Delete chore</button>
                </div>
              </div>
            ))}
          </div>

          <section className="space-y-3"><h3 className="text-lg font-extrabold text-slate-900">Chores in progress <span className="text-sm text-slate-500">({inProgressBossChores.length})</span></h3>{inProgressBossChores.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{inProgressBossChores.map((chore) => <article key={chore.id} className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4"><h4 className="font-bold">{chore.title}</h4><div className="mt-1 text-sm text-slate-600">{chore.assignments?.filter((a) => ['APPROVED', 'ACTIVE'].includes(a.status)).map((a) => a.worker?.fullName).filter(Boolean).join(', ') || 'Assigned'}</div>{chore.deadline && <p className="mt-1 text-xs font-semibold text-rose-700">Due {new Date(chore.deadline).toLocaleString()}</p>}</article>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No chores in progress.</p>}</section>
          <section className="rounded-2xl sm:rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-extrabold text-emerald-950">Completed chores</h3><p className="text-xs text-emerald-800">Finished work and the team member who completed it.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800">{completedAssignments.length}</span></div>
            {completedAssignments.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{completedAssignments.map((assignment) => <article key={assignment.id} id={`reference-completed-assignment-${assignment.id}`} className="min-w-0 rounded-2xl border border-emerald-100 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-slate-900 break-words">{assignment.choreTitle}</h4><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Completed</span></div><p className="mt-2 text-sm text-slate-700">Completed by <strong>{assignment.workerName}</strong></p>{assignment.completedAt && <p className="mt-1 text-xs text-slate-500">{new Date(assignment.completedAt).toLocaleDateString()}</p>}</article>)}</div> : <p className="rounded-xl bg-white/70 p-4 text-center text-sm text-slate-500">Completed chores will appear here.</p>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2"><h3 className="text-lg font-extrabold text-slate-900">Non attributed chores <span className="text-sm text-slate-500">({unattributedBossChores.length})</span></h3>{unattributedBossChores.length ? unattributedBossChores.map((chore) => <div key={chore.id} className="rounded-xl bg-white p-3"><strong>{chore.title}</strong><p className="text-xs text-slate-500">Request window closed {new Date(chore.requestDeadline!).toLocaleString()}</p></div>) : <p className="text-sm text-slate-500">No chores missed their request window.</p>}</section>

          {awaitingReviewSessions.length > 0 && <section className="bg-white rounded-2xl border border-sky-100 p-5 space-y-4"><h3 className="font-bold text-lg">Finished chores to review ({awaitingReviewSessions.length})</h3>{awaitingReviewSessions.map((session: any) => <article key={session.id} id={`reference-session-${session.id}`} className="border-t pt-4 space-y-3"><div><div className="font-bold">{session.workerName} · {session.choreTitle}</div><div className="text-xs text-slate-500">Work time: {Math.floor((session.durationSeconds || 0) / 60)} minutes · submitted {new Date(session.clockOutAt || session.clockInAt).toLocaleString()}</div></div><div className="flex flex-wrap gap-3">{session.beforePictureUrl && <a href={session.beforePictureUrl} target="_blank" rel="noreferrer"><img src={session.beforePictureUrl} alt="Before" className="w-32 h-24 object-cover rounded-xl" /><span className="text-xs">Before</span></a>}{session.afterPictureUrl && <a href={session.afterPictureUrl} target="_blank" rel="noreferrer"><img src={session.afterPictureUrl} alt="After" className="w-32 h-24 object-cover rounded-xl" /><span className="text-xs">After</span></a>}</div><div className="flex gap-2"><button disabled={reviewSessionMutation.isPending} onClick={() => reviewSessionMutation.mutate({ id: session.id, approved: true })} className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-bold">Approve and credit</button><button disabled={reviewSessionMutation.isPending} onClick={() => { const reason = window.prompt('What should the worker fix before resubmitting?'); if (reason?.trim()) reviewSessionMutation.mutate({ id: session.id, approved: false, reason: reason.trim() }); }} className="rounded-xl bg-rose-50 text-rose-800 px-4 py-2 text-sm font-bold">Ask for changes</button></div></article>)}</section>}

        </div>
      )}

      {/* TAB: SCANNER (CLOCK IN / CLOCK OUT) */}
      {activeTab === 'scanner' && (
        <div className="max-w-xl mx-auto bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-lg space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-3">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">NFC & QR Verification Station</h2>
            <p className="text-xs text-slate-500 mt-1">
              Tap the worker's NFC keychain against your phone or scan their QR badge to record attendance.
            </p>
          </div>

          {clockMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-semibold">
              ✅ {clockMessage}
            </div>
          )}

          {clockError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl text-xs font-semibold">
              ⚠️ {clockError}
            </div>
          )}

          {nfcError && <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs">{nfcError}</div>}

          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={startNfcScan} className="rounded-xl bg-emerald-100 text-emerald-900 px-4 py-2 font-bold text-sm">📡 Scan NFC badge</button>
            <button onClick={() => setCameraScanning((value) => !value)} className="rounded-xl bg-sky-100 text-sky-900 px-4 py-2 font-bold text-sm">{cameraScanning ? 'Stop camera' : '📷 Scan QR badge'}</button>
          </div>
          {cameraScanning && <div id="boss-qr-reader" className="max-w-sm mx-auto overflow-hidden rounded-2xl" />}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Worker Badge UID
              </label>
              <input
                type="text"
                value={scannedUid}
                onChange={(e) => { setScannedUid(e.target.value); setBadgeProof(undefined); setBadgeIssuedAt(undefined); setScanMethod('MANUAL'); setIdentifiedWorker(null); }}
                placeholder="e.g. NFC-LUCAS-001 or NFC-EMMA-002"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-hidden focus:border-purple-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tip: Lucas's badge is <code className="bg-slate-100 px-1 py-0.5 rounded">NFC-LUCAS-001</code>; Emma's is <code className="bg-slate-100 px-1 py-0.5 rounded">NFC-EMMA-002</code>
              </p>
            </div>

            <button type="button" onClick={() => identifyMutation.mutate()} disabled={!scannedUid || identifyMutation.isPending} className="w-full rounded-xl bg-purple-100 text-purple-900 py-2.5 font-bold disabled:opacity-40">{identifyMutation.isPending ? 'Checking team membership…' : 'Identify worker and approved chores'}</button>
            {identifiedWorker && <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm"><div className="font-bold text-emerald-900">{identifiedWorker.worker.fullName} <span className="font-normal">(@{identifiedWorker.worker.username})</span></div><div className="text-xs text-emerald-800 mt-1">Active team member · {identifiedWorker.assignments.length} approved chore(s) available</div>{identifiedWorker.activeSession && <div className="mt-2 font-semibold">Currently working: {identifiedWorker.activeSession.assignment.chore.title}</div>}</div>}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Select Chore (for Clock-In)
              </label>
              <select
                value={selectedChoreId}
                onChange={(e) => setSelectedChoreId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-purple-500"
              >
                <option value="">-- Choose Chore --</option>
                {identifiedWorker?.assignments?.map((a: any) => (
                  <option key={a.chore.id} value={a.chore.id}>{a.chore.title} ({a.chore.paymentType === 'FIXED' ? formatCurrency(a.chore.fixedAmount) : 'Hourly'})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => clockInMutation.mutate()}
                disabled={!identifiedWorker || !selectedChoreId || !identifiedWorker.assignments.some((a: any) => a.chore.id === selectedChoreId) || clockInMutation.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20"
              >
                ▶️ Confirm Clock In
              </button>

              <button
                type="button"
                onClick={() => clockOutMutation.mutate()}
                disabled={!identifiedWorker?.activeSession || clockOutMutation.isPending}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 text-sm flex items-center justify-center gap-1 shadow-md shadow-purple-600/20"
              >
                ⏹️ Confirm Clock Out
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'shopping' && <div className="bg-white rounded-3xl border border-orange-100 p-6 space-y-4"><div><h2 className="text-xl font-bold">Family To Buy list</h2><p className="text-sm text-slate-500">Supply requests from your team.</p></div>{shoppingItems?.length ? shoppingItems.map((item: any) => <div key={item.id} id={`reference-shopping-${item.id}`} className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div className="font-bold">{item.productName}</div><div className="text-xs text-slate-500">Requested by {item.worker.fullName} · {new Date(item.createdAt).toLocaleDateString()} · {item.status}</div>{item.description && <p className="text-sm text-slate-600">{item.description}</p>}</div><div className="flex gap-2">{item.status === 'PENDING' && <button onClick={() => shoppingStatusMutation.mutate({ id: item.id, status: 'APPROVED' })} className="rounded-lg bg-sky-50 text-sky-800 px-3 py-2 text-xs font-bold">Approve</button>}{['PENDING', 'APPROVED'].includes(item.status) && <button onClick={() => shoppingStatusMutation.mutate({ id: item.id, status: 'PURCHASED' })} className="rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 text-xs font-bold">Mark purchased</button>}{item.status === 'PENDING' && <button onClick={() => shoppingStatusMutation.mutate({ id: item.id, status: 'REJECTED' })} className="rounded-lg bg-rose-50 text-rose-800 px-3 py-2 text-xs font-bold">Decline</button>}</div></div>) : <div className="py-12 text-center text-slate-500">No supply requests yet.</div>}</div>}

      {/* TAB: PAYOUTS & PIGGY BANK */}
      {activeTab === 'payouts' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Piggy Bank Ledger & Payouts</h2>
            <p className="text-xs text-slate-500">
              Track worker earnings from your team and record official cash or digital payouts.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base mb-4">Worker Balances in Your Team</h3>
            <div className="divide-y divide-slate-100">
              {financeData?.workers?.map((w: any) => (
                <div key={w.workerId} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center text-sm">
                      {w.workerName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{w.workerName}</div>
                      <div className="text-xs text-slate-500">
                        Total Earned: <strong>{formatCurrency(w.earned)}</strong> | Total Paid: <strong>{formatCurrency(w.paid)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-400 font-medium uppercase">Unpaid Balance</div>
                      <div className="text-lg font-black text-emerald-600">{formatCurrency(w.unpaid)}</div>
                    </div>

                    <button
                      onClick={() => {
                        const amount = parseFloat(w.unpaid);
                        if (amount > 0) {
                          payWorkerMutation.mutate({ workerId: w.workerId, amount });
                        }
                      }}
                      disabled={parseFloat(w.unpaid) <= 0 || payWorkerMutation.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 shadow-xs"
                    >
                      Mark as Paid ({formatCurrency(w.unpaid)})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: WORKERS & INVITATIONS */}
      {activeTab === 'workers' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Family Team Members</h2>
              <p className="text-xs text-slate-500">Active workers and pending invitations</p>
            </div>
            <button
              onClick={() => setShowInviteWorker(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" /> Invite Worker
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamData?.members?.map((m: any) => (
              <div key={m.id} className="min-w-0 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-slate-100 text-slate-800 font-extrabold flex items-center justify-center text-base overflow-hidden">
                    <UserAvatar userId={m.worker.id} name={m.worker.fullName} className="h-full w-full text-2xl" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 break-words">{m.worker.fullName}</div>
                    <div className="text-xs text-slate-400">@{m.worker.username}</div>
                    <div className="text-[11px] text-purple-600 font-medium mt-0.5">
                      Badge: {m.worker.nfcBadge?.badgeUid || 'Assigned'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-row flex-wrap sm:flex-col items-center sm:items-end gap-2"><span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{m.status}</span>
                  {m.worker.nfcBadge && <button onClick={async () => { const candidates = teamData?.members?.filter((candidate: any) => candidate.status === 'ACTIVE' && candidate.worker.id !== m.worker.id && !candidate.worker.nfcBadge) || []; if (!candidates.length) { alert('There is no active team member without an existing badge.'); return; } const names = candidates.map((candidate: any) => `${candidate.worker.fullName} (@${candidate.worker.username})`).join(', '); const username = window.prompt(`Transfer badge ${m.worker.nfcBadge.badgeUid} to one of these active team members: ${names}`, candidates[0]?.worker?.username || ''); const target = candidates.find((candidate: any) => candidate.worker?.username?.toLowerCase() === username?.trim().replace(/^@/, '').toLowerCase()); if (!target?.worker) { if (username) alert('Choose a username from the listed team members.'); return; } if (!window.confirm(`Transfer this badge from ${m.worker.fullName} to ${target.worker.fullName}? This change will be recorded in the team activity log.`)) return; try { await api.sessions.reassignBadge(m.worker.nfcBadge.badgeUid, target.worker.id); queryClient.invalidateQueries({ queryKey: ['myTeam'] }); } catch (err: any) { alert(err.message || 'Badge transfer failed.'); } }} className="text-[10px] font-bold rounded-lg bg-amber-50 text-amber-900 px-2 py-1">Transfer badge</button>}
                  {m.status === 'ACTIVE' && <button type="button" disabled={removeWorkerMutation.isPending} onClick={() => { if (window.confirm(`Remove ${m.worker.fullName} from ${teamData?.name || 'this team'}? They will lose access to this team's active chores. Their account, other team memberships, earnings, and completed history will be kept.`)) removeWorkerMutation.mutate(m.worker.id); }} className="text-[10px] font-bold rounded-lg bg-rose-50 text-rose-800 px-2 py-1 disabled:opacity-50">Remove from team</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-orange-100 p-5 space-y-3">
            <h3 className="font-bold text-slate-900">Team Invitations</h3>
            {!teamData?.invitations?.length ? <p className="text-sm text-slate-500">No invitations have been sent yet.</p> : teamData.invitations.map((invitation: any) => <div key={invitation.id} id={`reference-invitation-${invitation.id}`} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-3"><UserAvatar userId={invitation.worker.id} name={invitation.worker.fullName} className="h-10 w-10 text-xl" /><div><div className="font-bold text-sm">{invitation.worker.fullName} <span className="text-xs text-slate-400">@{invitation.worker.username}</span></div><div className="text-xs text-slate-500">Sent {new Date(invitation.createdAt).toLocaleDateString()} · {invitation.message || 'No message'}</div></div></div>
              <div className="flex items-center gap-2"><span className={`text-xs font-bold rounded-full px-3 py-1 ${invitation.status === 'PENDING' ? 'bg-amber-50 text-amber-800' : invitation.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{invitation.status}</span>{invitation.status === 'PENDING' && <button onClick={async () => { try { await api.teams.cancelInvitation(invitation.id); queryClient.invalidateQueries({ queryKey: ['myTeam'] }); } catch (err: any) { alert(err.message); } }} className="text-xs font-semibold text-rose-700">Cancel</button>}{['REJECTED', 'CANCELLED'].includes(invitation.status) && <button onClick={async () => { const identifier = window.prompt('Worker email or username to invite again:', invitation.worker.username); if (!identifier) return; try { await api.teams.inviteWorker(identifier); queryClient.invalidateQueries({ queryKey: ['myTeam'] }); } catch (err: any) { alert(err.message); } }} className="text-xs font-semibold text-emerald-700">Resend</button>}</div>
            </div>)}
          </div>
        </div>
      )}

      {/* TAB: SALARY BRACKETS */}
      {activeTab === 'rates' && (
        <div className="max-w-2xl bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Age-Based Hourly Salary Brackets</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Rates are in Euros (€). You can adjust any bracket at any time. Past earnings remain frozen and never change.
              </p>
            </div>
            <button
              onClick={() => setShowEditRates(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap self-start sm:self-auto"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Brackets
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-4">
            {teamData?.salaryBrackets?.map((b: any) => (
              <div key={b.id} className="py-3 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-700">
                  {b.minAge === b.maxAge ? `Age ${b.minAge}` : `Age ${b.minAge} - ${b.maxAge}`}
                </span>
                <span className="font-extrabold text-purple-700 bg-purple-50 px-3 py-1 rounded-lg">
                  {formatCurrency(b.hourlyRate)} / hour
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Salary Brackets Modal */}
      {showEditRates && (
        <EditSalaryBracketsModal
          initialBrackets={teamData?.salaryBrackets || []}
          onClose={() => setShowEditRates(false)}
          onSuccess={() => {
            setShowEditRates(false);
            queryClient.invalidateQueries({ queryKey: ['myTeam'] });
          }}
        />
      )}

      {/* Create Chore Modal */}
      {showCreateChore && (
        <CreateChoreModal
          workers={teamData?.members?.filter((member: any) => member.status === 'ACTIVE').map((member: any) => member.worker) || []}
          onClose={() => setShowCreateChore(false)}
          onSuccess={() => {
            setShowCreateChore(false);
            queryClient.invalidateQueries({ queryKey: ['myTeamChores'] });
          }}
        />
      )}

      {/* Invite Worker Modal */}
      {showInviteWorker && (
        <InviteWorkerModal
          onClose={() => setShowInviteWorker(false)}
          onSuccess={() => {
            setShowInviteWorker(false);
            queryClient.invalidateQueries({ queryKey: ['myTeam'] });
          }}
        />
      )}
    </div>
  );
};

// Sub-Modal: Create Chore
const CreateChoreModal: React.FC<{ onClose: () => void; onSuccess: () => void; workers: { id: string; fullName: string; username: string }[] }> = ({ onClose, onSuccess, workers }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CLEANING');
  const [paymentType, setPaymentType] = useState<'FIXED' | 'HOURLY'>('FIXED');
  const [fixedAmount, setFixedAmount] = useState('5.00');
  const [requestDeadline, setRequestDeadline] = useState(() => { const d = new Date(Date.now() + 7 * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });
  const [assignedWorkerId, setAssignedWorkerId] = useState('');
  const [completionDeadline, setCompletionDeadline] = useState('');
  const localMinDateTime = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [requiresBeforeAfterPictures, setRequiresBeforeAfterPictures] = useState(false);
  const [pictures, setPictures] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const res = await api.upload(file);
      setPictures((prev) => [...prev, res.url]);
    } catch (err: any) {
      alert('Failed to upload picture: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const removePicture = (index: number) => {
    setPictures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.chores.create({
        title,
        description,
        category,
        paymentType,
        fixedAmount: paymentType === 'FIXED' ? parseFloat(fixedAmount) : 0,
        weekNumber: 46,
        year: 2026,
        requestDeadline: assignedWorkerId || !requestDeadline ? null : new Date(requestDeadline).toISOString(),
        deadline: completionDeadline ? new Date(completionDeadline).toISOString() : null,
        assignedWorkerId: assignedWorkerId || null,
        requiresBeforeAfterPictures,
        requiresNfc: true,
        pictures,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create chore.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-extrabold text-lg text-slate-900">Create New Chore</h3>

        {error && <div className="text-xs bg-red-50 text-red-700 p-3 rounded-xl">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Chore Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Wash dishes, Clean bedroom"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description</label>
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed instructions for the worker..."
              className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1">Assign to a team member (optional)</label><select value={assignedWorkerId} onChange={(e) => setAssignedWorkerId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm"><option value="">Leave open for team requests</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName} (@{worker.username})</option>)}</select><p className="mt-1 text-xs text-slate-500">Directly assigned workers have 48 hours to start the chore.</p></div>
          {!assignedWorkerId && <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1">Last time to request this chore</label><input type="datetime-local" required min={localMinDateTime()} value={requestDeadline} onChange={(e) => setRequestDeadline(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm" /><p className="mt-1 text-xs text-slate-500">If nobody requests it by then, it moves to Non attributed chores and workers can no longer see it.</p></div>}
          <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1">Completion deadline (optional)</label><input type="datetime-local" min={localMinDateTime()} value={completionDeadline} onChange={(e) => setCompletionDeadline(e.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm" /><p className="mt-1 text-xs text-slate-500">Leave blank for a flexible chore. If an assigned worker has not finished by this time, €0.50 is deducted once from their piggy bank.</p></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                <option value="CLEANING">Cleaning</option>
                <option value="GARDENING">Gardening</option>
                <option value="COOKING">Cooking</option>
                <option value="ORGANISATION">Organisation</option>
                <option value="LAUNDRY">Laundry</option>
                <option value="SHOPPING">Shopping</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Payment Method</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                <option value="FIXED">Fixed Amount (€)</option>
                <option value="HOURLY">Hourly (Age Rate)</option>
              </select>
            </div>
          </div>

          {paymentType === 'FIXED' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fixed Reward in Euro (€)</label>
              <input
                type="number"
                step="0.10"
                min="0"
                required
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="5.00"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
          )}

          {/* Chore Pictures / Visual Details */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
              <span>Chore Pictures & Details (Optional)</span>
              {uploadingImage && <span className="text-purple-600 font-semibold animate-pulse text-[11px]">Uploading...</span>}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {pictures.map((pic, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 group">
                  <img src={pic} alt="Chore detail" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePicture(idx)}
                    className="absolute inset-0 bg-red-900/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <label className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 hover:border-purple-500 flex flex-col items-center justify-center cursor-pointer transition-colors text-slate-400 hover:text-purple-600">
                <Upload className="w-4 h-4 mb-0.5" />
                <span className="text-[9px] font-bold">Add Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-400">
              Upload photos of the room, garden area, or example results for the worker to inspect.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="photoProof"
              checked={requiresBeforeAfterPictures}
              onChange={(e) => setRequiresBeforeAfterPictures(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <label htmlFor="photoProof" className="text-xs font-semibold text-slate-700">
              Require Before & After photo verification
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Chore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sub-Modal: Invite Worker
const InviteWorkerModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.teams.inviteWorker(identifier);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to send invite.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-extrabold text-lg text-slate-900">Invite Worker to Team</h3>
        {error && <div className="text-xs bg-red-50 text-red-700 p-3 rounded-xl">{error}</div>}

        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Worker Username or Email
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. lucas or emma@family.test"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Sub-Modal: Edit Salary Brackets
const EditSalaryBracketsModal: React.FC<{
  initialBrackets: any[];
  onClose: () => void;
  onSuccess: () => void;
}> = ({ initialBrackets, onClose, onSuccess }) => {
  const [brackets, setBrackets] = useState(
    initialBrackets.map((b) => ({
      minAge: b.minAge,
      maxAge: b.maxAge,
      hourlyRate: parseFloat(b.hourlyRate),
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRateChange = (index: number, val: number) => {
    const updated = [...brackets];
    updated[index].hourlyRate = val;
    setBrackets(updated);
  };

  const handleMinAgeChange = (index: number, val: number) => {
    const updated = [...brackets];
    updated[index].minAge = val;
    setBrackets(updated);
  };

  const handleMaxAgeChange = (index: number, val: number) => {
    const updated = [...brackets];
    updated[index].maxAge = val;
    setBrackets(updated);
  };

  const handleAddTier = () => {
    const maxPrev = brackets.length > 0 ? brackets[brackets.length - 1].maxAge : 12;
    setBrackets([
      ...brackets,
      { minAge: maxPrev + 1, maxAge: maxPrev + 1, hourlyRate: 3.50 },
    ]);
  };

  const handleRemoveTier = (index: number) => {
    setBrackets(brackets.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.teams.updateSalaryBrackets(brackets);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to update brackets.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-lg text-slate-900">Configure Salary Brackets</h3>
            <p className="text-xs text-slate-500">Set hourly rates in Euros (€) by worker age</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="text-xs bg-red-50 text-red-700 p-3 rounded-xl">{error}</div>}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3">
            {brackets.map((b, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">From Age</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={b.minAge}
                      onChange={(e) => handleMinAgeChange(idx, parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">To Age</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={b.maxAge}
                      onChange={(e) => handleMaxAgeChange(idx, parseInt(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Rate (€ / hr)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.50"
                      value={b.hourlyRate}
                      onChange={(e) => handleRateChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-purple-700"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveTier(idx)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Remove Bracket"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddTier}
            className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-purple-400 text-slate-600 hover:text-purple-700 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Age Tier
          </button>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Brackets'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
