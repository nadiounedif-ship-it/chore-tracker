import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const MyTeamsPage: React.FC = () => {
  const [tab, setTab] = useState<'teams' | 'invitations'>('teams');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { setActivePage, setActiveTeamId, refreshUser } = useAuth();
  const cache = useQueryClient();
  const teamsQuery = useQuery({ queryKey: ['myTeams'], queryFn: api.teams.getMyTeams });
  const invitationsQuery = useQuery({ queryKey: ['teamInvitations'], queryFn: api.teams.getInvitations });
  const respond = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'ACCEPT' | 'REJECT' }) => api.teams.respondInvitation(id, action), onSuccess: async (result) => { setError(''); setMessage(result.message); await Promise.all([cache.invalidateQueries({ queryKey: ['teamInvitations'] }), cache.invalidateQueries({ queryKey: ['myTeams'] }), refreshUser()]); }, onError: (err: any) => setError(err.message || 'Could not respond to invitation.') });
  const leave = async (team: any) => {
    const warnings = [team.unfinishedChores ? `${team.unfinishedChores} unfinished or pending chore(s)` : '', Number(team.unpaid) > 0 ? `${team.unpaid} € unpaid earnings` : ''].filter(Boolean);
    const warningText = warnings.length ? `\n\nPlease resolve or discuss: ${warnings.join(' and ')}.` : '';
    if (!window.confirm(`Leave ${team.team.name}? You may lose access to this team's active chores.${warningText}\n\nYour account, other teams, completed chore history, earnings and payment records will remain.`)) return;
    try { await api.teams.leaveTeam(team.teamId); setMessage(`You left ${team.team.name}. Your history has been kept.`); setError(''); await Promise.all([cache.invalidateQueries({ queryKey: ['myTeams'] }), refreshUser()]); }
    catch (err: any) { setError(err.message || 'Could not leave this team.'); }
  };
  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-5">
    <div><h1 className="text-3xl font-extrabold text-slate-900">My Teams</h1><p className="text-slate-600 mt-1">Your family teams and invitations, all in one place.</p></div>
    {(message || error) && <div className={`p-3 rounded-xl text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}
    <div className="flex gap-2 border-b"><button onClick={() => setTab('teams')} className={`px-4 py-3 font-bold ${tab === 'teams' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-500'}`}>My Teams ({teamsQuery.data?.length || 0})</button><button onClick={() => setTab('invitations')} className={`px-4 py-3 font-bold ${tab === 'invitations' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-500'}`}>Invitations ({invitationsQuery.data?.length || 0})</button></div>
    {tab === 'teams' && <div className="grid md:grid-cols-2 gap-4">{teamsQuery.data?.length ? teamsQuery.data.map((membership: any) => <article key={membership.teamId} className="bg-white rounded-2xl border border-orange-100 p-5 space-y-4">
      <div className="flex items-center gap-3"><div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center overflow-hidden text-xl">{membership.team.avatarUrl ? <img src={membership.team.avatarUrl} className="w-full h-full object-cover" /> : '🏡'}</div><div><h2 className="font-extrabold text-lg">{membership.team.name}</h2><p className="text-sm text-slate-600">With {membership.team.boss.fullName}</p></div></div>
      <p className="text-sm text-slate-600">{membership.team.description || 'A place to share chores and celebrate progress.'}</p>
      <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-emerald-50 text-emerald-800 px-3 py-1">Active member</span><span className="rounded-full bg-sky-50 text-sky-800 px-3 py-1">{membership.activeMemberCount} team members</span><span className="rounded-full bg-amber-50 text-amber-900 px-3 py-1">Unpaid: {membership.unpaid} €</span></div>
      <div className="flex gap-2"><button onClick={() => { setActiveTeamId(membership.teamId); setActivePage('dashboard'); }} className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-bold">Open this team</button><button onClick={() => leave(membership)} className="rounded-xl border px-4 py-2 font-semibold text-slate-700">Leave team</button></div>
    </article>) : <div className="md:col-span-2 text-center py-14 rounded-2xl bg-white border border-dashed text-slate-500">No teams yet. Invitations will appear in the Invitations tab.</div>}</div>}
    {tab === 'invitations' && <div className="space-y-3">{invitationsQuery.data?.length ? invitationsQuery.data.map((invitation: any) => <article key={invitation.id} id={`reference-invitation-${invitation.id}`} className="bg-white rounded-2xl border border-orange-100 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex gap-3 items-center"><div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center overflow-hidden">{invitation.team.avatarUrl ? <img src={invitation.team.avatarUrl} className="w-full h-full object-cover" /> : '🏠'}</div><div><h2 className="font-bold">{invitation.team.name}</h2><p className="text-sm text-slate-600">Invited by {invitation.team.boss.fullName} · {new Date(invitation.createdAt).toLocaleDateString()}</p>{invitation.message && <p className="text-sm text-slate-500 mt-1">“{invitation.message}”</p>}</div></div>
      <div className="flex gap-2"><button disabled={respond.isPending} onClick={() => respond.mutate({ id: invitation.id, action: 'ACCEPT' })} className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-bold disabled:opacity-50">Accept</button><button disabled={respond.isPending} onClick={() => respond.mutate({ id: invitation.id, action: 'REJECT' })} className="rounded-xl bg-rose-50 text-rose-800 px-4 py-2 font-bold disabled:opacity-50">Decline</button></div>
    </article>) : <div className="text-center py-14 rounded-2xl bg-white border border-dashed text-slate-500">You’re all caught up. No pending invitations.</div>}</div>}
  </div>;
};
