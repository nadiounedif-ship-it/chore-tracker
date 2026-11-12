import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Shield, User as UserIcon, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { login, registerBoss, registerWorker } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<'BOSS' | 'WORKER'>('WORKER');

  // Form States
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(identifier, password);
      } else {
        if (role === 'BOSS') {
          await registerBoss({
            email,
            username,
            fullName,
            password,
            teamName,
            teamDescription,
          });
        } else {
          await registerWorker({
            email,
            username,
            fullName,
            password,
            dateOfBirth,
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Demo Login Handler
  const handleQuickLogin = (demoIdentifier: string) => {
    setIdentifier(demoIdentifier);
    setPassword('Password123!');
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-slate-50 to-blue-50/40 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Icon */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white shadow-xl shadow-brand-500/25">
            <Sparkles className="w-8 h-8" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          Chore Manager
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500 font-medium">
          Family chore distribution, time-tracking & piggy bank platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 rounded-3xl border border-slate-200 sm:px-10">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'login' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Email or Username
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. dad@family.test or lucas"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                  />
                </div>
              </>
            ) : (
              <>
                {/* Role Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Choose Your Role
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setRole('BOSS')}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        role === 'BOSS'
                          ? 'border-purple-500 bg-purple-50/50 ring-2 ring-purple-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <Shield className={`w-6 h-6 mb-2 ${role === 'BOSS' ? 'text-purple-600' : 'text-slate-400'}`} />
                      <div>
                        <div className="font-bold text-sm text-slate-900">Boss / Parent</div>
                        <div className="text-[11px] text-slate-500">Creates chores & manages team</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole('WORKER')}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        role === 'WORKER'
                          ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <UserIcon className={`w-6 h-6 mb-2 ${role === 'WORKER' ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <div>
                        <div className="font-bold text-sm text-slate-900">Worker / Child</div>
                        <div className="text-[11px] text-slate-500">Performs chores & earns money</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={role === 'BOSS' ? 'David Miller' : 'Lucas Miller'}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="lucas"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="lucas@family.test"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                  />
                </div>

                {role === 'WORKER' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Date of Birth (Required for Age-Based Wages)
                    </label>
                    <input
                      type="date"
                      required
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Hourly rates adjust automatically on your birthday!
                    </p>
                  </div>
                )}

                {role === 'BOSS' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Team Name
                      </label>
                      <input
                        type="text"
                        required
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="e.g. Miller Household, Dad's Crew"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Team Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={teamDescription}
                        onChange={(e) => setTeamDescription(e.target.value)}
                        placeholder="e.g. Garden and outdoor maintenance"
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-500"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 text-white font-bold py-3 px-4 rounded-xl shadow-md shadow-brand-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Processing...' : mode === 'login' ? 'Sign In to Dashboard' : 'Complete Registration'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Credentials Assistant */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">
              Quick Test Demo Accounts
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickLogin('dad@family.test')}
                className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold border border-purple-200 text-left transition-colors cursor-pointer"
              >
                👑 Boss: Dad
                <span className="block text-[10px] text-purple-500 font-normal">dad@family.test</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('mum@family.test')}
                className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold border border-purple-200 text-left transition-colors cursor-pointer"
              >
                👑 Boss: Mum
                <span className="block text-[10px] text-purple-500 font-normal">mum@family.test</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('lucas@family.test')}
                className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200 text-left transition-colors cursor-pointer"
              >
                ⭐ Worker: Lucas (16)
                <span className="block text-[10px] text-emerald-500 font-normal">lucas@family.test</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('emma@family.test')}
                className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200 text-left transition-colors cursor-pointer"
              >
                ⭐ Worker: Emma (14)
                <span className="block text-[10px] text-emerald-500 font-normal">emma@family.test</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center mt-3">
              Password for all demo accounts: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">Password123!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
