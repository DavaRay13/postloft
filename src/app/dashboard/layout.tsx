'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  Sparkles,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  User,
  X,
  BarChart3,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/reports', label: 'Laporan', icon: BarChart3 },
  { href: '/dashboard/users', label: 'Akun', icon: Users },
  { href: '/dashboard/settings', label: 'Pengaturan', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState('');
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        document.cookie = `loftpos-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        router.push('/login');
        return;
      }
      if (session.user?.user_metadata?.role === 'cashier') {
        await supabase.auth.signOut();
        document.cookie = `loftpos-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        router.push('/login');
        return;
      }
      setUserEmail(session.user.email ?? '');
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    document.cookie = `loftpos-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    router.refresh();
    router.push('/login');
  };

  // WIB clock
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' WIB'
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex justify-center">
      {/* Background ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[380px] h-[380px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[380px] h-[380px] bg-violet-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Mobile-Only Main Container (max-w-md represents a standard smartphone width) */}
      <div className="w-full max-w-md min-h-screen bg-slate-950 border-x border-slate-800/80 shadow-2xl relative flex flex-col">
        {/* Mobile Header Bar */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-md shadow-indigo-500/25">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-1.5 leading-none">
                SeblakSS POS
              </h1>
              <span className="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider">
                Owner Dashboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-indigo-300 font-mono bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-900/40">
              {currentTime}
            </span>
            <button
              onClick={() => setProfileDrawerOpen(true)}
              className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
              aria-label="Profil & Logout"
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 z-10 pb-24">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (Docked inside smartphone frame) */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-3 py-2 flex items-center justify-around shadow-2xl">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'text-indigo-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div
                  className={`p-1.5 rounded-xl transition-transform ${
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-400 scale-110'
                      : 'text-slate-400'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Logout Bottom Sheet Drawer */}
        {profileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
              onClick={() => setProfileDrawerOpen(false)}
            />

            {/* Bottom Sheet Modal */}
            <div className="relative w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 space-y-4 shadow-2xl z-10 animate-in slide-in-from-bottom duration-200">
              {/* Drawer handle */}
              <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-1" />

              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 truncate max-w-[200px]">
                      {userEmail || 'Owner'}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
                        Owner / Administrator
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setProfileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Navigation Links */}
              <div className="space-y-1.5">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setProfileDrawerOpen(false)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-indigo-400" />
                    <span>Pengaturan Struk & PIN Owner</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </Link>

                <Link
                  href="/dashboard/users"
                  onClick={() => setProfileDrawerOpen(false)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Kelola Akun Kasir</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </Link>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/30 text-xs font-bold transition-all active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout dari Dashboard</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
