import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Bell, LogOut, CheckCheck, Users, Shield, Sparkles, Menu, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const Header: React.FC = () => {
  const { user, role, logout, activeTeamId, setActiveTeamId, activePage, setActivePage, setDashboardTab } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [showNavigation, setShowNavigation] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('beforeinstallprompt', onInstall); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    refetchInterval: 10000, // Poll notifications every 10 seconds
    enabled: !!user,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const openNotification = (notification: any) => {
    if (!notification.isRead) markReadMutation.mutate(notification.id);
    const url = notification.linkUrl || '';
    if (url.includes('/teams')) setActivePage('teams');
    else {
      setActivePage('dashboard');
      if (role === 'BOSS') {
        if (url.includes('shopping')) setDashboardTab('shopping');
        else if (url.includes('worker')) setDashboardTab('workers');
        else if (url.includes('approval') || url.includes('chore')) setDashboardTab('chores');
        else if (url.includes('piggy')) setDashboardTab('payouts');
      } else if (url.includes('piggy')) setDashboardTab('piggybank');
      else if (url.includes('chore')) setDashboardTab('mychores');
    }
    if (notification.teamId && role === 'WORKER') setActiveTeamId(notification.teamId);
    setShowNotifications(false);
    if (notification.referenceType && notification.referenceId) {
      window.setTimeout(() => {
        const target = document.getElementById(`reference-${notification.referenceType}-${notification.referenceId}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    }
  };

  const dashboardLinks = role === 'BOSS'
    ? [{ id: 'overview', label: 'Home' }, { id: 'chores', label: 'Chores & requests' }, { id: 'chat', label: 'Team chat' }, { id: 'scanner', label: 'Clock in / out' }, { id: 'payouts', label: 'Piggy bank & payouts' }, { id: 'workers', label: 'Workers & invitations' }, { id: 'rates', label: 'Salary brackets' }, { id: 'shopping', label: 'To Buy list' }]
    : [{ id: 'home', label: 'Home' }, { id: 'piggybank', label: 'Piggy bank' }, { id: 'available', label: 'Available chores' }, { id: 'mychores', label: 'My chores' }, { id: 'chat', label: 'Team chat' }, { id: 'qr', label: 'NFC & QR badge' }, { id: 'goals', label: 'Savings goals' }, { id: 'shopping', label: 'Request supplies' }];

  const navigateDashboard = (tab: string) => {
    setActivePage('dashboard');
    setDashboardTab(tab);
    setShowNavigation(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo & Name */}
        <button type="button" onClick={() => navigateDashboard(role === 'BOSS' ? 'overview' : 'home')} aria-label="Go to home" className="flex items-center gap-2 sm:gap-3 text-left min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight">Chore Manager</span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  role === 'BOSS'
                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}
              >
                {role === 'BOSS' ? '👑 BOSS' : '⭐ WORKER'}
              </span>
            </div>
            {role === 'BOSS' && user?.ownedTeam && (
              <p className="text-xs text-slate-500 font-medium">Team: {user.ownedTeam.name}</p>
            )}
          </div>
        </button>

        {/* Worker Team Selector (Visible when Worker has teams) */}
        {role === 'WORKER' && user?.teamMemberships && user.teamMemberships.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 max-w-64">
            <Users className="w-4 h-4 text-slate-500 ml-2" />
            <select
              value={activeTeamId}
              onChange={(e) => setActiveTeamId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 pr-3 py-1 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">🌐 All Teams (Combined Overview)</option>
              {user.teamMemberships.map((m) => (
                <option key={m.teamId} value={m.teamId}>
                  👥 {m.team?.name || 'Team'} ({m.team?.boss?.fullName || 'Boss'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* User Actions & Notifications */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2 relative">
          <button type="button" onClick={() => setShowNavigation((open) => !open)} aria-label={showNavigation ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={showNavigation} className="p-2 rounded-xl text-slate-700 hover:bg-amber-50" title="Navigation">
            {showNavigation ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {showNavigation && <>
            <button type="button" aria-label="Close navigation menu" onClick={() => setShowNavigation(false)} className="fixed inset-0 z-[45] cursor-default bg-slate-950/20 md:bg-transparent" />
            <nav aria-label="Main navigation" className="fixed left-3 right-3 top-[4.5rem] mx-auto w-auto max-w-md max-h-[calc(100dvh-5.25rem)] overflow-y-auto overscroll-contain bg-white rounded-2xl shadow-2xl border border-orange-100 p-2 z-[50] md:absolute md:left-auto md:right-0 md:top-12 md:mx-0 md:w-72 md:max-h-[75vh]">
            <div className="sticky top-0 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Menu</div>
            {role === 'WORKER' && user?.teamMemberships && user.teamMemberships.length > 0 && <label className="block px-3 pb-2 sm:hidden"><span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Current team</span><select aria-label="Choose current team" value={activeTeamId} onChange={(event) => { setActiveTeamId(event.target.value); setShowNavigation(false); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><option value="ALL">All Teams</option>{user.teamMemberships.map((membership) => <option key={membership.teamId} value={membership.teamId}>{membership.team?.name || 'Team'}</option>)}</select></label>}
            {dashboardLinks.map((link) => <button key={link.id} onClick={() => navigateDashboard(link.id)} className="w-full text-left rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-50">{link.label}</button>)}
            {role === 'WORKER' && <button onClick={() => { setActivePage('teams'); setShowNavigation(false); }} className="w-full text-left rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-50">My Teams</button>}
            <button onClick={() => { setActivePage('profile'); setShowNavigation(false); }} className="w-full text-left rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-amber-50">Profile & settings</button>
            </nav>
          </>}
          {!online && <span className="hidden sm:inline text-xs font-bold rounded-full bg-amber-100 text-amber-900 px-3 py-1">Offline · some features need internet</span>}
          {online && installPrompt && <button onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }} className="hidden sm:inline-flex text-xs font-bold rounded-xl bg-amber-100 text-amber-900 px-3 py-2">Install app</button>}
          {/* Notification Button */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {notifData?.unreadCount ? (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {notifData.unreadCount > 9 ? '9+' : notifData.unreadCount}
              </span>
            ) : null}
          </button>

          {/* Notifications Dropdown Modal */}
          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm">Notifications</h4>
                {notifData?.unreadCount ? (
                  <button
                    onClick={() => markAllReadMutation.mutate()}
                    className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-medium"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                ) : null}
              </div>

              <div className="max-h-72 overflow-y-auto mt-2 space-y-2">
                {!notifData?.notifications.length ? (
                  <p className="text-xs text-slate-400 text-center py-6">No notifications yet.</p>
                ) : (
                  notifData.notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => openNotification(n)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                        n.isRead ? 'bg-slate-50 text-slate-600' : 'bg-brand-50/70 border border-brand-100 text-slate-900 font-medium'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-semibold text-slate-900">{n.title}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-600">{n.message}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Profile Name & Avatar */}
          <div className="flex items-center gap-2 sm:pl-2 sm:border-l border-slate-200">
            <button onClick={() => setActivePage('profile')} className={`w-8 h-8 rounded-full bg-amber-100 overflow-hidden flex items-center justify-center font-bold text-amber-900 text-xs ${activePage === 'profile' ? 'ring-2 ring-amber-500' : ''}`} title="Your profile">
              {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'U'}
            </button>
            <div className="hidden sm:block text-left leading-tight">
              <div className="text-sm font-semibold text-slate-800">{user?.fullName}</div>
              <div className="text-[11px] text-slate-400">@{user?.username}</div>
            </div>
            <button onClick={() => role === 'WORKER' ? setActivePage('teams') : setActivePage('profile')} className="hidden sm:inline-flex text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-2 rounded-xl">{role === 'WORKER' ? 'My Teams' : 'Profile'}</button>
          </div>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
