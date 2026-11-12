import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  activeTeamId: string; // 'ALL' or a specific teamId
  setActiveTeamId: (id: string) => void;
  activePage: 'dashboard' | 'teams' | 'profile';
  setActivePage: (page: 'dashboard' | 'teams' | 'profile') => void;
  dashboardTab: string | null;
  setDashboardTab: (tab: string | null) => void;
  login: (identifier: string, password: string) => Promise<void>;
  registerBoss: (data: any) => Promise<void>;
  registerWorker: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTeamId, setActiveTeamId] = useState<string>('ALL');
  const [activePage, setActivePage] = useState<'dashboard' | 'teams' | 'profile'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<string | null>(null);
  const currentPageRef = useRef(activePage);
  currentPageRef.current = activePage;

  const refreshUser = async () => {
    try {
      const current = await api.auth.me();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // This app changes screens in React state rather than changing browser URLs.
  // Keep a same-page history entry so a phone's Back button doesn't immediately
  // leave the app. From Profile or My Teams, Back returns to the dashboard first.
  useEffect(() => {
    if (!user) return;
    const guardState = { choreManagerApp: true, navigationGuard: true };
    window.history.replaceState(guardState, '', window.location.href);
    window.history.pushState(guardState, '', window.location.href);
    const handleBack = () => {
      if (currentPageRef.current !== 'dashboard') {
        setActivePage('dashboard');
        setDashboardTab(user.role === 'BOSS' ? 'overview' : 'home');
      }
      window.history.pushState(guardState, '', window.location.href);
    };
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [user?.id]);

  const login = async (identifier: string, password: string) => {
    const res = await api.auth.login(identifier, password);
    setUser(res.user);
    setActiveTeamId('ALL');
    setActivePage('dashboard');
  };

  const registerBoss = async (data: any) => {
    const res = await api.auth.registerBoss(data);
    setUser(res.user);
    setActivePage('dashboard');
  };

  const registerWorker = async (data: any) => {
    const res = await api.auth.registerWorker(data);
    setUser(res.user);
    setActiveTeamId('ALL');
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      setActiveTeamId('ALL');
      setActivePage('dashboard');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        loading,
        activeTeamId,
        setActiveTeamId,
        activePage,
        setActivePage,
        dashboardTab,
        setDashboardTab,
        login,
        registerBoss,
        registerWorker,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
