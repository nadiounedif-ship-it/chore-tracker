import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const emailOptions = [
  ['INVITATION', 'Team invitations and membership'], ['CHORE', 'Chore assignments and reviews'],
  ['DEADLINE', 'Upcoming chore deadlines'], ['PAYMENT', 'Payments and earnings'],
  ['SHOPPING', 'Shopping requests'], ['ACCOUNT', 'Other important account updates'],
] as const;

export const ProfilePage: React.FC = () => {
  const { user, refreshUser, role } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { data: team } = useQuery({ queryKey: ['myTeam'], queryFn: api.teams.getMyTeam, enabled: role === 'BOSS' });
  const preferences = user?.emailNotificationPreferences || { enabled: false, categories: [] };

  useEffect(() => { setFullName(user?.fullName || ''); setUsername(user?.username || ''); }, [user]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('verify-email');
    if (!token) return;
    api.auth.verifyEmail(token).then(async (result) => { setMessage(result.message); await refreshUser(); }).catch((err: any) => setError(err.message || 'Email verification failed.')).finally(() => {
      const url = new URL(window.location.href); url.searchParams.delete('verify-email'); window.history.replaceState({}, '', url.toString());
    });
  }, []);

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

  const toggleCategory = (category: string) => {
    const categories = preferences.categories.includes(category)
      ? preferences.categories.filter((item) => item !== category)
      : [...preferences.categories, category];
    run(() => api.auth.updateNotificationPreferences({ enabled: preferences.enabled, categories }), 'Email preferences saved.');
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
        <label className="text-sm font-semibold">Email address<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{user.email} <span className="ml-2 text-xs">{user.emailVerified ? 'Verified' : 'Not verified'}</span></div></label>
        <label className="text-sm font-semibold">Account type<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{role === 'BOSS' ? 'Boss / Parent' : 'Worker'}</div></label>
        <label className="text-sm font-semibold">Date of birth<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString() : 'Not provided'} <span className="block text-xs text-slate-500 mt-1">This cannot be changed from your profile because it affects age-based pay.</span></div></label>
        <label className="text-sm font-semibold">Member since<div className="mt-1 rounded-xl bg-slate-50 border border-slate-100 p-3 font-normal">{new Date(user.createdAt).toLocaleDateString()}</div></label>
        <div className="sm:col-span-2"><button className="rounded-xl bg-emerald-600 text-white px-5 py-2.5 font-bold">Save personal information</button></div>
      </form>
      <form className="border-t pt-5 grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => api.auth.changeEmail(newEmail, emailPassword), 'Verification link sent to your new email address.'); }}>
        <input type="email" required placeholder="New email address" aria-label="New email address" className="rounded-xl border p-3" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <input type="password" required placeholder="Confirm with password" className="rounded-xl border p-3" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
        <button className="rounded-xl bg-amber-500 text-white px-4 py-2 font-bold">Change email securely</button>
      </form>
      {!user.emailVerified && <div className="rounded-xl bg-amber-50 p-4 space-y-2"><p className="text-sm text-amber-950">Your current address <strong>{user.email}</strong> is not verified. Send a verification link to this address, or use the form above to change it first.</p><button type="button" onClick={() => run(() => api.auth.resendEmailVerification())} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700">Send verification to my current email</button><p className="text-xs text-amber-900">If the message does not arrive, check spam and ask the app administrator to confirm the email service is configured.</p></div>}
    </section>

    <section className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-7 space-y-4">
      <h2 className="text-xl font-bold">Account Security</h2>
      <form className="grid sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => api.auth.updatePassword(currentPassword, newPassword), 'Password updated.'); setCurrentPassword(''); setNewPassword(''); }}>
        <input type="password" required placeholder="Current password" className="rounded-xl border p-3" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <input type="password" required minLength={8} placeholder="New password (8+ characters)" className="rounded-xl border p-3" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <button className="rounded-xl bg-slate-800 text-white px-4 py-2 font-bold">Update password</button>
      </form>
      <p className="text-sm text-slate-500">Active sessions expire after seven days without account activity. Password changes sign out other devices.</p>
    </section>

    <section className="bg-white rounded-2xl border border-orange-100 p-5 sm:p-7 space-y-4">
      <h2 className="text-xl font-bold">Notification Preferences</h2>
      <label className="flex items-center justify-between p-3 rounded-xl bg-amber-50"><span className="font-semibold">Receive email notifications</span><input type="checkbox" checked={preferences.enabled} onChange={(e) => run(() => api.auth.updateNotificationPreferences({ enabled: e.target.checked, categories: preferences.categories }), 'Email preferences saved.')} /></label>
      <p className="text-xs text-slate-500">In-app notifications always remain available. Email is sent only to your verified address.</p>
      <div className="grid sm:grid-cols-2 gap-2">{emailOptions.map(([key, label]) => <label key={key} className="flex gap-2 items-center p-2 rounded-lg hover:bg-orange-50"><input type="checkbox" disabled={!preferences.enabled} checked={preferences.categories.includes(key)} onChange={() => toggleCategory(key)} />{label}</label>)}</div>
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
