import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser, role } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pushState, setPushState] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const { data: team } = useQuery({ queryKey: ['myTeam'], queryFn: api.teams.getMyTeam, enabled: role === 'BOSS' });

  useEffect(() => { setFullName(user?.fullName || ''); setUsername(user?.username || ''); }, [user]);
  useEffect(() => { if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(async (registration) => setPushEnabled(!!(await registration.pushManager.getSubscription()))).catch(() => {}); }, []);

  const run = async (action: () => Promise<any>, successText?: string) => {
    setError(''); setMessage('');
    try { const result = await action(); setMessage(result?.message || successText || 'Changes saved.'); await refreshUser(); queryClient.invalidateQueries(); }
    catch (err: any) { setError(err.message || 'Could not save changes.'); }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    await run(async () => {
      const uploaded = await api.upload(file);
      return api.auth.updateProfile({ avatarUrl: uploaded.url });
    }, 'Profile photo updated.');
  };

  const enablePush = async () => {
    setPushState('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Phone notifications are not supported by this browser. On iPhone, add Chore Manager to your Home Screen first.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await api.notifications.pushKey();
      if (!publicKey) throw new Error('Phone notifications are not configured on the app server yet.');
      const keyBytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
      await api.notifications.savePushSubscription(subscription.toJSON());
      setPushEnabled(true);
      setPushState('Phone notifications are enabled on this device.');
    } catch (err: any) { setPushState(err.message || 'Could not enable phone notifications.'); }
  };
  const disablePush = async () => {
    try { const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); if (subscription) { await api.notifications.removePushSubscription(subscription.endpoint); await subscription.unsubscribe(); } setPushEnabled(false); setPushState('Phone notifications are disabled on this device.'); }
    catch (err: any) { setPushState(err.message || 'Could not disable phone notifications.'); }
  };

  if (!user) return null;
  return <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
    <div><h1 className="text-3xl font-extrabold text-slate-900">Your profile</h1><p className="text-slate-600 mt-1">Manage your personal details and account settings.</p></div>
    {(message || error) && <div className={`p-3 rounded-xl text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}

    <section className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-7 space-y-5">
      <h2 className="text-xl font-bold">Personal Information</h2>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-amber-100 overflow-hidden flex items-center justify-center text-2xl font-bold text-amber-800">{user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : user.fullName[0]}</div>
        <label className="px-4 py-2 rounded-xl bg-amber-50 text-amber-900 font-semibold cursor-pointer">Change profile picture<input className="hidden" type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} /></label>
      </div>
      <form className="grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); run(() => api.auth.updateProfile({ fullName, username })); }}>
        <label className="text-sm font-semibold">Full name<input className="block w-full mt-1 rounded-xl border border-slate-200 p-3" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label className="text-sm font-semibold">Username<input className="block w-full mt-1 rounded-xl border border-slate-200 p-3" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label className="text-sm font-semibold">Email address<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{user.email}<span className="mt-1 block text-xs text-slate-500">Email changes are temporarily unavailable.</span></div></label>
        <label className="text-sm font-semibold">Account type<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{role === 'BOSS' ? 'Boss / Parent' : 'Worker'}</div></label>
        <label className="text-sm font-semibold">Date of birth<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString() : 'Not provided'} <span className="block text-xs text-slate-500 mt-1">This cannot be changed from your profile because it affects age-based pay.</span></div></label>
        <label className="text-sm font-semibold">Member since<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{new Date(user.createdAt).toLocaleDateString()}</div></label>
        <div className="sm:col-span-2"><button className="rounded-xl bg-emerald-600 text-white px-5 py-2.5 font-bold">Save personal information</button></div>
      </form>
    </section>

    <section className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-7 space-y-4">
      <h2 className="text-xl font-bold">Account Security</h2>
      <div className="border-t pt-4 space-y-2"><h3 className="font-bold">Phone notifications</h3><p className="text-sm text-slate-600">Get important Chore Manager updates on this device.</p><button type="button" onClick={pushEnabled ? disablePush : enablePush} className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-bold">{pushEnabled ? 'Disable phone notifications' : 'Enable phone notifications'}</button>{pushState && <p className="text-sm text-slate-600">{pushState}</p>}</div>
      <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => api.auth.updatePassword(currentPassword, newPassword), 'Password updated.'); setCurrentPassword(''); setNewPassword(''); }}>
        <input type="password" required placeholder="Current password" className="rounded-xl border p-3" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <input type="password" required minLength={8} placeholder="New password (8+ characters)" className="rounded-xl border p-3" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <button className="rounded-xl bg-slate-800 text-white px-4 py-2 font-bold">Update password</button>
      </form>
      <p className="text-sm text-slate-500">Active sessions expire after seven days without account activity. Password changes sign out other devices.</p>
    </section>

    <section className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-7 space-y-4">
      <h2 className="text-xl font-bold">Notifications</h2>
      <p className="text-sm text-slate-600">Important updates appear in the in-app bell. Enable phone notifications above to receive alerts when the app is closed.</p>
    </section>

    {role === 'BOSS' && <section className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-7 space-y-4">
      <h2 className="text-xl font-bold">Payment Settings</h2>
      <p className="text-sm text-slate-600">These settings apply to future payment periods. Existing periods and payment history stay unchanged.</p>
      <PaymentSettings team={team} onSave={(values) => run(() => api.teams.savePaymentSettings(values), 'Payment schedule saved.')} />
    </section>}
  </div>;
};

const PaymentSettings: React.FC<{ team: any; onSave: (values: any) => void }> = ({ team, onSave }) => {
  const [schedule, setSchedule] = useState(team?.paymentSchedule || 'WEEKLY_SUNDAY');
  const [interval, setInterval] = useState(team?.customPaymentIntervalDays || 14);
  const [day, setDay] = useState(team?.customPaymentDay || 1);
  const [customMode, setCustomMode] = useState<'interval' | 'day'>(team?.customPaymentDay ? 'day' : 'interval');
  useEffect(() => { if (team) { setSchedule(team.paymentSchedule); setInterval(team.customPaymentIntervalDays || 14); setDay(team.customPaymentDay || 1); setCustomMode(team.customPaymentDay ? 'day' : 'interval'); } }, [team]);
  const nextDate = team?.nextPaymentDate ? new Date(team.nextPaymentDate).toLocaleDateString() : 'Not scheduled';
  return <form className="grid sm:grid-cols-3 gap-3 items-end" onSubmit={(e) => { e.preventDefault(); onSave({ paymentSchedule: schedule, customPaymentIntervalDays: schedule === 'CUSTOM' && customMode === 'interval' ? Number(interval) : null, customPaymentDay: schedule === 'CUSTOM' && customMode === 'day' ? Number(day) : null }); }}>
    <label className="text-sm font-semibold">Frequency<select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="block w-full mt-1 rounded-xl border p-3"><option value="WEEKLY_SUNDAY">Weekly</option><option value="BIWEEKLY">Every two weeks</option><option value="MONTHLY">Monthly</option><option value="CUSTOM">Custom</option></select></label>
    {schedule === 'CUSTOM' && <div className="sm:col-span-2 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Custom rule<select className="block w-full mt-1 rounded-xl border p-3" value={customMode} onChange={(e) => setCustomMode(e.target.value as any)}><option value="interval">Repeat every number of days</option><option value="day">Use a day of the month</option></select></label>{customMode === 'interval' ? <label className="text-sm font-semibold">Interval (days)<input type="number" min={1} max={365} value={interval} onChange={(e) => setInterval(e.target.value)} className="block w-full mt-1 rounded-xl border p-3" /></label> : <label className="text-sm font-semibold">Day of month (1–28)<input type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} className="block w-full mt-1 rounded-xl border p-3" /></label>}</div>}
    <div className="sm:col-span-2 font-semibold text-sm">Next scheduled payment: <span className="text-emerald-700">{nextDate}</span></div>
    <button className="rounded-xl bg-emerald-600 text-white px-5 py-2.5 font-bold">Save schedule</button>
  </form>;
};
