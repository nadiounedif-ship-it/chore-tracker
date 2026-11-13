import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const TeamChat: React.FC<{ teamId?: string }> = ({ teamId }) => {
  const [message, setMessage] = useState('');
  const cache = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['teamChat', teamId], queryFn: () => api.chat.list(teamId!), enabled: !!teamId, refetchInterval: 5000 });
  const send = useMutation({ mutationFn: () => api.chat.send(teamId!, message), onSuccess: async () => { setMessage(''); await cache.invalidateQueries({ queryKey: ['teamChat', teamId] }); } });
  if (!teamId) return <div className="rounded-2xl bg-white p-6 text-center text-slate-600">Choose one of your teams to open its team chat.</div>;
  return <section className="mx-auto max-w-3xl rounded-3xl border border-orange-100 bg-white p-4 sm:p-6 space-y-4"><div><h2 className="text-xl font-extrabold">Team chat</h2><p className="text-sm text-slate-500">A shared message space for everyone in this team.</p></div><div className="max-h-[55vh] min-h-56 overflow-y-auto space-y-3 rounded-2xl bg-amber-50/60 p-3">{data.length ? data.map((item: any) => <article key={item.id} className="rounded-xl bg-white p-3"><div className="text-xs font-bold text-emerald-800">{item.sender.fullName} <span className="font-normal text-slate-400">· {new Date(item.createdAt).toLocaleString()}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{item.message}</p></article>) : <p className="py-12 text-center text-sm text-slate-500">No messages yet. Say hello to your team!</p>}</div><form onSubmit={(e) => { e.preventDefault(); if (message.trim()) send.mutate(); }} className="flex gap-2"><input maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write to your whole team…" className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3" /><button disabled={!message.trim() || send.isPending} className="rounded-xl bg-emerald-600 px-4 font-bold text-white disabled:opacity-50">Send</button></form>{send.isError && <p className="text-sm text-rose-700">Could not send this message. Please try again.</p>}</section>;
};
