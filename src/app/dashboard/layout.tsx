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
  Menu,
  X,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/reports', label: 'Laporan Keuangan', icon: BarChart3 },
  { href: '/dashboard/users', label: 'Kelola Akun', icon: Users },
  { href: '/dashboard/settings', label: 'Pengaturan Struk', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex">
      {/* Decorative Glow */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-40 top-0 left-0 h-full w-64 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/80 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="px-6 py-5 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 shadow-md shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-100">SeblakSS POS</h1>
              <p className="text-[9px] uppercase tracking-wider text-indigo-400 font-bold">Admin Dashboard</p>
            </div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User + Clock */}
        <div className="px-4 py-4 border-t border-slate-800/60 space-y-3">
          <div className="text-center">
            <p className="text-lg font-bold text-indigo-400 font-mono">{currentTime}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950/60">
            <User className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-300 truncate">{userEmail}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-red-400 hover:text-red-300 px-3 py-2 rounded-xl hover:bg-red-950/20 border border-red-900/20 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header bar */}
        <header className="lg:hidden z-20 backdrop-blur-md bg-slate-900/40 border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold">SeblakSS POS</span>
          </div>
          <span className="text-xs text-indigo-400 font-mono">{currentTime}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 z-10">
          {children}
        </main>

        <footer className="mt-auto border-t border-slate-800/50 py-4 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} SeblakSS POS Admin Dashboard. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
