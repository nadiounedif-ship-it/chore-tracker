import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { formatCurrency } from '../../lib/utils';
import {
  Sparkles,
  PiggyBank,
  CheckCircle2,
  Clock,
  Play,
  Square,
  QrCode,
  Target,
  ShoppingBag,
  Upload,
  Plus,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const WorkerDashboard: React.FC = () => {
  const { user, activeTeamId, dashboardTab, setDashboardTab } = useAuth();
  const queryClient = useQueryClient();

  // Navigation Tab
  const [activeTab, setActiveTab] = useState<'piggybank' | 'available' | 'mychores' | 'qr' | 'goals' | 'shopping'>('piggybank');

  // Modals & Timers
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [beforeProofUrl, setBeforeProofUrl] = useState('');
  const [afterProofUrl, setAfterProofUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [shoppingName, setShoppingName] = useState('');
  const [shoppingTeamId, setShoppingTeamId] = useState(user?.teamMemberships?.[0]?.teamId || '');

  // Physical NFC Tag Linking State
  const [customTagUid, setCustomTagUid] = useState('');
  const [tagLabel, setTagLabel] = useState('');
  const [nfcScanning, setNfcScanning] = useState(false);
  const [nfcStatusMessage, setNfcStatusMessage] = useState<string | null>(null);
  const [nfcErrorMessage, setNfcErrorMessage] = useState<string | null>(null);

  // Queries
  const { data: piggyData } = useQuery({
    queryKey: ['piggyOverview', activeTeamId],
    queryFn: () => api.piggybank.getOverview(activeTeamId === 'ALL' ? undefined : activeTeamId),
  });

  const { data: availableChores } = useQuery({
    queryKey: ['availableChores', activeTeamId],
    queryFn: () => api.chores.getAvailable(activeTeamId === 'ALL' ? undefined : activeTeamId),
  });

  const { data: myAssignments } = useQuery({
    queryKey: ['myAssignments', activeTeamId],
    queryFn: () => api.chores.getMyAssignments(undefined, activeTeamId === 'ALL' ? undefined : activeTeamId),
  });

  const { data: qrData } = useQuery({
    queryKey: ['qrBadge'],
    queryFn: () => api.sessions.getQrBadge(),
    refetchInterval: 60_000,
  });

  const { data: savingsGoals } = useQuery({
    queryKey: ['savingsGoals'],
    queryFn: () => api.savings.list(),
  });

  const { data: activeSession } = useQuery({
    queryKey: ['workerActiveSession'],
    queryFn: () => api.sessions.getActive(),
    refetchInterval: 3000,
  });
  const { data: shoppingRequests } = useQuery({ queryKey: ['shoppingRequests', activeTeamId], queryFn: () => api.shopping.list(activeTeamId === 'ALL' ? undefined : activeTeamId) });

  useEffect(() => {
    if (dashboardTab && ['piggybank', 'available', 'mychores', 'qr', 'goals', 'shopping'].includes(dashboardTab)) {
      setActiveTab(dashboardTab as any); setDashboardTab(null);
    }
  }, [dashboardTab, setDashboardTab]);

  // Timer Tick for Active Session
  useEffect(() => {
    let interval: any;
    if (activeSession && activeSession.clockInAt) {
      const startTime = new Date(activeSession.clockInAt).getTime();
      const updateTimer = () => {
        const now = new Date().getTime();
        setTimerSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setTimerSeconds(0);
    }
    return () => clearInterval(interval);
  }, [activeSession]);

  // Mutations
  const requestChoreMutation = useMutation({
    mutationFn: (choreId: string) => api.chores.requestChore(choreId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availableChores'] });
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
    },
  });

  const remoteStartMutation = useMutation({
    mutationFn: ({ assignmentId, beforePictureUrl }: { assignmentId: string; beforePictureUrl?: string }) =>
      api.sessions.remoteStart(assignmentId, beforePictureUrl),
    onSuccess: () => {
      setBeforeProofUrl('');
      queryClient.invalidateQueries({ queryKey: ['workerActiveSession'] });
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
    },
  });

  const remoteSubmitMutation = useMutation({
    mutationFn: ({ sessionId, afterPictureUrl }: { sessionId: string; afterPictureUrl?: string }) =>
      api.sessions.remoteSubmit(sessionId, afterPictureUrl),
    onSuccess: () => {
      setAfterProofUrl('');
      queryClient.invalidateQueries({ queryKey: ['workerActiveSession'] });
      queryClient.invalidateQueries({ queryKey: ['myAssignments'] });
    },
  });

  const linkBadgeMutation = useMutation({
    mutationFn: ({ badgeUid, label }: { badgeUid: string; label?: string }) =>
      api.sessions.linkNfcBadge(badgeUid, label),
    onSuccess: (res) => {
      setNfcStatusMessage(res.message);
      setNfcErrorMessage(null);
      setCustomTagUid('');
      queryClient.invalidateQueries({ queryKey: ['qrBadge'] });
    },
    onError: (err: any) => {
      setNfcErrorMessage(err.message || 'Failed to link NFC tag.');
      setNfcStatusMessage(null);
    },
  });

  const createShoppingMutation = useMutation({
    mutationFn: () => api.shopping.createRequest({ teamId: shoppingTeamId, productName: shoppingName }),
    onSuccess: async () => { setShoppingName(''); await queryClient.invalidateQueries({ queryKey: ['shoppingRequests'] }); },
  });

  const handleWebNfcScan = async () => {
    if (!('NDEFReader' in window)) {
      setNfcErrorMessage(
        'Web NFC is not supported on this browser or PC. To scan physically with NFC, open this page on Chrome for Android, or type the tag serial number in the box below.'
      );
      return;
    }

    try {
      setNfcScanning(true);
      setNfcStatusMessage('Ready! Hold your physical NFC tag or keychain against the back of your smartphone...');
      setNfcErrorMessage(null);

      const NDEFReaderClass = (window as any).NDEFReader;
      const ndef = new NDEFReaderClass();
      await ndef.scan();

      ndef.onreading = (event: any) => {
        const serial = event.serialNumber;
        if (serial) {
          linkBadgeMutation.mutate({
            badgeUid: serial.toUpperCase(),
            label: tagLabel || 'Physical NFC Tag',
          });
          setNfcScanning(false);
        }
      };
    } catch (err: any) {
      setNfcScanning(false);
      setNfcErrorMessage(err.message || 'NFC scan failed. Ensure NFC is turned on in your Android settings.');
    }
  };

  const uploadProof = async (file: File | undefined, setUrl: (url: string) => void) => {
    if (!file) return;
    setPhotoError('');
    try { const result = await api.upload(file); setUrl(result.url); }
    catch (err: any) { setPhotoError(err.message || 'Could not upload this photo.'); }
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const hrs = Math.floor(mins / 60);
    return `${hrs > 0 ? `${hrs}:` : ''}${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner: Combined Piggy Bank Balance */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                <PiggyBank className="w-3.5 h-3.5" />
                {activeTeamId === 'ALL' ? '🌟 Global Piggy Bank' : 'Team Piggy Bank'}
              </span>
              <span className="text-emerald-200 text-xs font-medium">
                {activeTeamId === 'ALL' ? 'Combined Across All Teams' : 'Filtered to Active Team'}
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-black tracking-tight mt-1">
              {formatCurrency(piggyData?.totalUnpaid || '0.00')}
            </div>
            <p className="text-emerald-100 text-xs mt-1">Total Unpaid Earnings Ready for Payout</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-emerald-900/40 p-4 rounded-2xl border border-emerald-500/20">
            <div className="text-left pr-4 border-r border-emerald-600/40">
              <span className="text-[10px] text-emerald-200 uppercase font-bold tracking-wider">Total Earned</span>
              <div className="text-lg font-extrabold text-white">{formatCurrency(piggyData?.totalEarned || '0.00')}</div>
            </div>
            <div className="text-left">
              <span className="text-[10px] text-emerald-200 uppercase font-bold tracking-wider">Total Paid Out</span>
              <div className="text-lg font-extrabold text-emerald-300">{formatCurrency(piggyData?.totalPaid || '0.00')}</div>
            </div>
          </div>
        </div>

        {/* Live Active Timer Banner if Worker is Working */}
        {activeSession && (
          <div className="mt-6 pt-6 border-t border-emerald-600/30 flex items-center justify-between flex-wrap gap-4 bg-emerald-950/40 -mx-6 -mb-6 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-400 text-emerald-950 flex items-center justify-center font-black animate-pulse">
                <Play className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">Clocked In Now</div>
                <div className="font-bold text-sm text-white">{activeSession.assignment?.chore?.title}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="font-mono text-2xl font-black text-emerald-200 bg-emerald-900/60 px-4 py-1 rounded-xl border border-emerald-500/30">
                ⏱️ {formatTimer(timerSeconds)}
              </div>
              {activeSession.isRemote && (
                <div className="flex flex-col gap-1 text-xs">
                  {activeSession.assignment?.chore?.requiresBeforeAfterPictures && <label className="text-emerald-100">After photo (required)<input type="file" accept="image/*" capture="environment" className="block max-w-56 text-xs" onChange={(e) => uploadProof(e.target.files?.[0], setAfterProofUrl)} />{afterProofUrl && <span>Photo ready ✓</span>}</label>}
                  <button
                    onClick={() => remoteSubmitMutation.mutate({ sessionId: activeSession.id, afterPictureUrl: afterProofUrl || undefined })}
                    disabled={remoteSubmitMutation.isPending || (!!activeSession.assignment?.chore?.requiresBeforeAfterPictures && !afterProofUrl)}
                    className="bg-white hover:bg-emerald-50 text-emerald-900 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-md disabled:opacity-50"
                  >
                    Submit Chore for Review
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2 pb-px">
        {[
          { id: 'piggybank', label: '💰 Piggy Bank & Teams' },
          { id: 'available', label: `🔍 Available Chores (${availableChores?.length || 0})` },
          { id: 'mychores', label: `📋 My Chores (${myAssignments?.length || 0})` },
          { id: 'qr', label: '📱 NFC Tag & QR Badge' },
          { id: 'goals', label: `🎯 Savings Goals (${savingsGoals?.length || 0})` },
          { id: 'shopping', label: '🛒 Request Supplies' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 font-bold text-sm rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'border-b-2 border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: PIGGY BANK & TEAM BREAKDOWN */}
      {activeTab === 'piggybank' && (
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Earnings Breakdown by Team</h2>
            <p className="text-xs text-slate-500">Each boss manages their team finances independently.</p>
          </div>

          {/* Team Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {piggyData?.byTeam?.map((team) => (
              <div key={team.teamId} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100">
                      Boss: {team.bossName}
                    </span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-lg">{team.teamName}</h3>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Total Earned:</span>
                    <div className="font-bold text-slate-800 text-sm">{formatCurrency(team.earned)}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400">Unpaid Owed:</span>
                    <div className="font-black text-emerald-600 text-base">{formatCurrency(team.unpaid)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Immutable Transactions */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base mb-4">Recent Financial Transactions</h3>
            {!piggyData?.recentTransactions.length ? (
              <p className="text-xs text-slate-400 py-4 text-center">No transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {piggyData.recentTransactions.map((tx) => (
                  <div key={tx.id} id={`reference-payment-${tx.id}`} className="py-3.5 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{tx.description}</div>
                      <div className="text-xs text-slate-400">
                        {tx.teamName || tx.team?.name || 'Team'} • {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div
                      className={`text-sm font-extrabold ${
                        parseFloat(tx.amount) > 0 ? 'text-emerald-600' : 'text-blue-600'
                      }`}
                    >
                      {parseFloat(tx.amount) > 0 ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: AVAILABLE CHORES */}
      {activeTab === 'available' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Available Chores</h2>
            <p className="text-xs text-slate-500">Chores posted by bosses across your joined teams</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {availableChores?.map((chore) => (
              <div key={chore.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between overflow-hidden">
                <div>
                  {/* Chore Picture if attached */}
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
                    <span className="text-sm font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100">
                      {chore.paymentType === 'FIXED' ? formatCurrency(chore.fixedAmount) : 'Hourly Rate'}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base">{chore.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{chore.description}</p>
                  <p className="text-[11px] text-purple-700 font-semibold mt-2">Team: {chore.team?.name}</p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  {chore.requiresBeforeAfterPictures && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded">
                      📷 Proof Req.
                    </span>
                  )}
                  <button
                    onClick={() => requestChoreMutation.mutate(chore.id)}
                    disabled={requestChoreMutation.isPending}
                    className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    Request Chore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: MY CHORES */}
      {activeTab === 'mychores' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">My Assigned Chores</h2>
            <p className="text-xs text-slate-500">Track approved chores and start working</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myAssignments?.map((a) => (
              <div key={a.id} id={`reference-chore-${a.choreId}`} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      Status: {a.status}
                    </span>
                    <span className="text-xs font-extrabold text-emerald-700">
                      {a.chore?.paymentType === 'FIXED' ? formatCurrency(a.chore.fixedAmount) : 'Hourly'}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">{a.chore?.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{a.chore?.description}</p>
                  {a.chore?.requiresBeforeAfterPictures && a.status === 'APPROVED' && <label className="block mt-3 text-xs font-semibold text-slate-600">Before photo (required)<input type="file" accept="image/*" capture="environment" className="block mt-1 text-xs" onChange={(e) => uploadProof(e.target.files?.[0], setBeforeProofUrl)} />{beforeProofUrl && <span className="text-emerald-700">Photo ready ✓</span>}</label>}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Team: {a.chore?.team?.name}</span>
                  {a.status === 'APPROVED' && !activeSession && (
                    <button
                      onClick={() => remoteStartMutation.mutate({ assignmentId: a.id, beforePictureUrl: beforeProofUrl || undefined })}
                      disabled={!!a.chore?.requiresBeforeAfterPictures && !beforeProofUrl}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs"
                    >
                      ▶️ Start Remote Work
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: NFC TAG & QR BADGE */}
      {activeTab === 'qr' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Active Badge Card */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <QrCode className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">Your Attendance Badge</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Show this QR code to your Boss or tap your linked physical NFC tag against their phone to clock in and out.
            </p>

            {qrData?.qrDataUrl ? (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
                <img src={qrData.qrDataUrl} alt="Attendance QR Code" className="w-48 h-48 mx-auto rounded-xl" />
              </div>
            ) : (
              <div className="py-12 text-slate-400 text-xs">Generating QR Badge...</div>
            )}

            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                Active Linked Identifier
              </span>
              <div className="font-mono text-sm font-black text-emerald-800 bg-emerald-50 border border-emerald-200 py-2 px-5 rounded-xl inline-block shadow-xs">
                🏷️ {qrData?.badgeUid || 'NFC-PENDING'}
              </div>
            </div>
          </div>

          {/* Link Physical Tag Card */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-lg space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                📡
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Link a Physical NFC Tag or Keychain</h3>
                <p className="text-xs text-slate-500">
                  Pair any standard NFC sticker, keychain, card, or wristband with your account.
                </p>
              </div>
            </div>

            {nfcStatusMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs font-semibold">
                ✅ {nfcStatusMessage}
              </div>
            )}

            {nfcErrorMessage && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-2xl text-xs font-semibold">
                ℹ️ {nfcErrorMessage}
              </div>
            )}

            {/* Option A: Direct Web NFC Tap */}
            <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-purple-900 block">Option A: Tap to Scan Tag (Phone)</span>
                  <span className="text-[11px] text-purple-600">Uses your phone's built-in NFC sensor</span>
                </div>
                <button
                  type="button"
                  onClick={handleWebNfcScan}
                  disabled={nfcScanning}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-sm ${
                    nfcScanning
                      ? 'bg-purple-400 animate-pulse'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {nfcScanning ? 'Listening for Tag...' : '📱 Tap Tag to Phone'}
                </button>
              </div>
            </div>

            {/* Option B: Manual Serial Number Input */}
            <div className="space-y-3 pt-2">
              <span className="font-bold text-xs text-slate-700 uppercase tracking-wider block">
                Option B: Type Tag Serial Number Manually
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTagUid}
                  onChange={(e) => setCustomTagUid(e.target.value)}
                  placeholder="e.g. 04:A2:3B:4C:5D or custom ID"
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-hidden focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customTagUid.trim()) {
                      linkBadgeMutation.mutate({
                        badgeUid: customTagUid.trim().toUpperCase(),
                        label: tagLabel || 'Physical Tag',
                      });
                    }
                  }}
                  disabled={!customTagUid.trim() || linkBadgeMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40 shadow-xs"
                >
                  Save Badge
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                You can enter the ID printed on your tag or read by any free NFC phone app (such as NFC Tools).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: SAVINGS GOALS */}
      {activeTab === 'goals' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Personal Savings Goals</h2>
              <p className="text-xs text-slate-500">Set targets for toys, games or gadgets using your combined piggy bank</p>
            </div>
            <button
              onClick={() => setShowGoalModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Goal
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savingsGoals?.map((goal: any) => (
              <div key={goal.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-900 text-base">{goal.name}</h3>
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    Target: {formatCurrency(goal.targetAmount)}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500 font-semibold">
                    <span>Saved: {formatCurrency(goal.currentPiggyBalance)}</span>
                    <span>{goal.progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${goal.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'shopping' && (
        <div className="space-y-5 max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl border border-orange-100 p-6"><h2 className="text-xl font-bold">Request supplies</h2><p className="text-sm text-slate-600 mt-1">Ask your Boss for something needed for a chore.</p>
            <form className="mt-4 flex flex-col sm:flex-row gap-3" onSubmit={(e) => { e.preventDefault(); if (shoppingTeamId && shoppingName.trim()) createShoppingMutation.mutate(); }}>
              <select className="rounded-xl border p-3" value={shoppingTeamId} onChange={(e) => setShoppingTeamId(e.target.value)} required><option value="">Choose a team</option>{user?.teamMemberships?.map((m: any) => <option key={m.teamId} value={m.teamId}>{m.team?.name || 'Team'}</option>)}</select>
              <input className="flex-1 rounded-xl border p-3" placeholder="What do you need?" value={shoppingName} onChange={(e) => setShoppingName(e.target.value)} required minLength={2} />
              <button disabled={createShoppingMutation.isPending} className="rounded-xl bg-amber-500 text-white px-5 py-3 font-bold">Send request</button>
            </form>
            {createShoppingMutation.isError && <p className="text-sm text-rose-700 mt-2">{(createShoppingMutation.error as Error).message}</p>}
          </div>
          <div className="bg-white rounded-2xl border border-orange-100 p-6"><h3 className="font-bold">Your requests</h3>{shoppingRequests?.length ? <div className="divide-y mt-3">{shoppingRequests.map((item: any) => <div key={item.id} id={`reference-shopping-${item.id}`} className="py-3 flex justify-between gap-3"><div><div className="font-semibold">{item.productName}</div><div className="text-xs text-slate-500">{item.team?.name} · {new Date(item.createdAt).toLocaleDateString()}</div></div><span className="text-xs font-bold rounded-full bg-amber-50 px-3 py-1 h-fit">{item.status}</span></div>)}</div> : <p className="text-sm text-slate-500 py-5">No supply requests yet.</p>}</div>
        </div>
      )}

      {photoError && <div className="fixed bottom-4 right-4 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl shadow-lg text-sm">{photoError}<button onClick={() => setPhotoError('')} className="ml-3 font-bold">Dismiss</button></div>}

      {/* Goal Modal */}
      {showGoalModal && (
        <CreateGoalModal
          onClose={() => setShowGoalModal(false)}
          onSuccess={() => {
            setShowGoalModal(false);
            queryClient.invalidateQueries({ queryKey: ['savingsGoals'] });
          }}
        />
      )}
    </div>
  );
};

// Sub-Modal: Create Savings Goal
const CreateGoalModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('100.00');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.savings.create(name, parseFloat(targetAmount));
      onSuccess();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-extrabold text-lg text-slate-900">Add Savings Goal</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Goal Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nintendo Switch Game, Smartphone"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Target Amount in Euro (€)</label>
            <input
              type="number"
              step="1"
              min="1"
              required
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Add Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
