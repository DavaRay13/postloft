'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  TrendingUp,
  DollarSign,
  QrCode,
  RefreshCw,
  Search,
  Receipt,
  Users as UsersIcon,
  BarChart3,
  ArrowRight,
  Trash2,
  Eye,
  X,
  Loader2,
  UserCheck,
  Layers,
  ListFilter,
  User,
  Clock,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

interface Transaction {
  id: string;
  trx_number: string;
  amount: number;
  payment_method: 'CASH' | 'QRIS';
  status: 'PENDING' | 'PAID' | 'FAILED';
  daily_queue_number: number | null;
  cashier_seq_number?: number | null;
  created_at: string;
  additions?: string | null;
  order_type: 'dine_in' | 'takeaway';
  cashier_id?: string | null;
}

interface TransactionItem {
  id: string;
  transaction_id: string;
  item_name: string;
  qty: number;
  price: number;
}

// Format tanggal ke WIB
function toWIB(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isTodayWIB(dateStr: string) {
  const date = new Date(dateStr);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
  const todayStr = formatter.format(new Date());
  const dateStrFormatted = formatter.format(date);
  return todayStr === dateStrFormatted;
}

function assignCashierSequenceNumbers(list: Transaction[]): Transaction[] {
  const groups: { [key: string]: Transaction[] } = {};

  list.forEach((tx) => {
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(tx.created_at));
    const cashierKey = tx.cashier_id || 'system';
    const groupKey = `${dateKey}_${cashierKey}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(tx);
  });

  const assignedMap = new Map<string, number>();

  Object.values(groups).forEach((groupTxs) => {
    // Urutkan kronologis terlama ke terbaru untuk memberi nomor urut #1, #2, #3...
    const sortedAsc = [...groupTxs].sort((a, b) => {
      const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (a.daily_queue_number || 0) - (b.daily_queue_number || 0);
    });

    sortedAsc.forEach((tx, index) => {
      assignedMap.set(tx.id, index + 1);
    });
  });

  return list.map((tx) => ({
    ...tx,
    cashier_seq_number: assignedMap.get(tx.id) || 1,
  }));
}

function sortTransactions(list: Transaction[]): Transaction[] {
  const withSeq = assignCashierSequenceNumbers(list);
  return withSeq.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return (b.cashier_seq_number || b.daily_queue_number || 0) - (a.cashier_seq_number || a.daily_queue_number || 0);
  });
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterText, setFilterText] = useState('');
  const [cashierMap, setCashierMap] = useState<{ [id: string]: string }>({});
  const [selectedCashierFilter, setSelectedCashierFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');

  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [txItems, setTxItems] = useState<TransactionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const handleViewDetails = async (tx: Transaction) => {
    setSelectedTx(tx);
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('transaction_items')
        .select('*')
        .eq('transaction_id', tx.id);
      if (error) throw error;
      setTxItems(data || []);
    } catch (e) {
      alert('Gagal mengambil rincian transaksi: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setLoadingItems(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (selectedTx?.id === id) {
        setSelectedTx(null);
      }
    } catch (e) {
      alert('Gagal menghapus transaksi: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await fetch('/api/admin-users', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          if (res.ok) {
            const usersData = await res.json();
            const mapping: { [key: string]: string } = {};
            usersData.users?.forEach((u: { id: string; email: string }) => {
              mapping[u.id] = u.email;
            });
            setCashierMap(mapping);
          }
        }
      } catch (e) {
        console.error('Gagal mengambil data kasir:', e);
      }

      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
      const todayStr = formatter.format(now); // YYYY-MM-DD
      const startOfToday = new Date(`${todayStr}T00:00:00+07:00`).toISOString();
      const endOfToday = new Date(`${todayStr}T23:59:59+07:00`).toISOString();

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', startOfToday)
        .lte('created_at', endOfToday)
        .order('created_at', { ascending: false })
        .order('daily_queue_number', { ascending: false });

      if (!error && data) {
        setTransactions(sortTransactions(data as Transaction[]));
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newTrx = payload.new as Transaction;
          if (isTodayWIB(newTrx.created_at)) {
            setTransactions((prev) => {
              if (prev.some((t) => t.id === newTrx.id)) return prev;
              return sortTransactions([newTrx, ...prev]);
            });
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedTrx = payload.new as Transaction;
          setTransactions((prev) => {
            if (isTodayWIB(updatedTrx.created_at)) {
              return sortTransactions(prev.map((t) => (t.id === updatedTrx.id ? updatedTrx : t)));
            } else {
              return prev.filter((t) => t.id !== updatedTrx.id);
            }
          });
        } else if (payload.eventType === 'DELETE') {
          const oldTrx = payload.old as { id: string };
          setTransactions((prev) => prev.filter((t) => t.id !== oldTrx.id));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatMoney = (val: number) => 'Rp ' + Math.round(val).toLocaleString('id-ID');

  // Stats (WIB timezone aware)
  const todayStats = (() => {
    let total = 0, cash = 0, qris = 0, count = 0, dineIn = 0, takeaway = 0;
    const cashierRevenue: { [cashierId: string]: number } = {};

    transactions.forEach((t) => {
      if (t.status === 'PAID') {
        const amt = Number(t.amount);
        total += amt;
        count++;
        if (t.payment_method === 'CASH') cash += amt;
        if (t.payment_method === 'QRIS') qris += amt;
        if (t.order_type === 'dine_in') dineIn++;
        if (t.order_type === 'takeaway') takeaway++;

        const cid = t.cashier_id || 'system';
        cashierRevenue[cid] = (cashierRevenue[cid] || 0) + amt;
      }
    });
    return { total, cash, qris, count, dineIn, takeaway, cashierRevenue };
  })();

  // Klasifikasi / Grouping per Akun Kasir
  const cashierAccounts = (() => {
    const ids = new Set<string>();
    transactions.forEach((t) => ids.add(t.cashier_id || 'system'));
    Object.keys(cashierMap).forEach((id) => ids.add(id));

    return Array.from(ids)
      .map((id) => {
        const email = cashierMap[id];
        const name = email || (id === 'system' ? 'Sistem / Offline' : 'Kasir (' + id.substring(0, 6) + ')');
        const txs = transactions.filter((t) => (t.cashier_id || 'system') === id);
        const paidTxs = txs.filter((t) => t.status === 'PAID');
        const totalRevenue = paidTxs.reduce((acc, t) => acc + Number(t.amount), 0);
        const cashRevenue = paidTxs.filter((t) => t.payment_method === 'CASH').reduce((acc, t) => acc + Number(t.amount), 0);
        const qrisRevenue = paidTxs.filter((t) => t.payment_method === 'QRIS').reduce((acc, t) => acc + Number(t.amount), 0);
        const count = txs.length;
        const dineInCount = txs.filter((t) => t.order_type === 'dine_in').length;
        const takeawayCount = txs.filter((t) => t.order_type === 'takeaway').length;

        return {
          id,
          name,
          email,
          totalRevenue,
          cashRevenue,
          qrisRevenue,
          count,
          paidCount: paidTxs.length,
          dineInCount,
          takeawayCount,
          transactions: sortTransactions(txs),
        };
      })
      .filter((c) => c.count > 0 || (c.id !== 'system' && cashierMap[c.id]))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  })();

  // Filtered transactions
  const filteredTransactions = transactions.filter((t) => {
    const cashierEmail = cashierMap[t.cashier_id || ''] || '';
    const matchesSearch =
      (t.trx_number && t.trx_number.toLowerCase().includes(filterText.toLowerCase())) ||
      t.payment_method.toLowerCase().includes(filterText.toLowerCase()) ||
      t.status.toLowerCase().includes(filterText.toLowerCase()) ||
      cashierEmail.toLowerCase().includes(filterText.toLowerCase());

    const matchesCashier =
      selectedCashierFilter === 'all' || (t.cashier_id || 'system') === selectedCashierFilter;

    return matchesSearch && matchesCashier;
  });

  const cashPercent = todayStats.total > 0 ? Math.round((todayStats.cash / todayStats.total) * 100) : 0;
  const qrisPercent = todayStats.total > 0 ? Math.round((todayStats.qris / todayStats.total) * 100) : 0;

  // Selected cashier stats (if specific cashier selected)
  const activeCashierData = cashierAccounts.find((c) => c.id === selectedCashierFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] py-20">
        <div className="flex flex-col items-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm font-medium text-slate-400">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* STATS CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Revenue */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl transition-transform duration-200 hover:border-slate-700">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-indigo-500/15 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Omset Hari Ini</span>
            <div className="p-1.5 sm:p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400"><TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{formatMoney(todayStats.total)}</h2>
          <p className="text-[9px] sm:text-[10px] text-indigo-400 mt-1 flex items-center gap-1 font-medium"><span>●</span> Realtime</p>
        </div>

        {/* Customer count */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl transition-transform duration-200 hover:border-slate-700">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-amber-500/15 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Pelanggan</span>
            <div className="p-1.5 sm:p-2.5 bg-amber-500/10 rounded-xl text-amber-400"><UsersIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{todayStats.count}</h2>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            <p className="text-[9px] sm:text-[10px] text-blue-400 flex items-center gap-1 font-medium">Dine In: {todayStats.dineIn}</p>
            <p className="text-[9px] sm:text-[10px] text-orange-400 flex items-center gap-1 font-medium">Takeaway: {todayStats.takeaway}</p>
          </div>
        </div>

        {/* Cash */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl transition-transform duration-200 hover:border-slate-700">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-emerald-500/15 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Tunai (Cash)</span>
            <div className="p-1.5 sm:p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400"><DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{formatMoney(todayStats.cash)}</h2>
          <p className="text-[9px] sm:text-[10px] text-emerald-400 mt-1 font-medium">{cashPercent}% dari total</p>
        </div>

        {/* QRIS */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl transition-transform duration-200 hover:border-slate-700">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-violet-500/15 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">QRIS (Digital)</span>
            <div className="p-1.5 sm:p-2.5 bg-violet-500/10 rounded-xl text-violet-400"><QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{formatMoney(todayStats.qris)}</h2>
          <p className="text-[9px] sm:text-[10px] text-violet-400 mt-1 font-medium">{qrisPercent}% dari total</p>
        </div>
      </section>

      {/* KLASIFIKASI KASIR - TAB & FILTER BAR (RESPONSIF MOBILE) */}
      <section className="backdrop-blur-md bg-slate-900/50 border border-slate-800/80 rounded-2xl p-3 sm:p-4 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">Klasifikasi Akun Kasir</h3>
              <p className="text-[11px] text-slate-400">Pilih akun untuk melihat transaksi berurutan per kasir</p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 border border-slate-800/70 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setViewMode('flat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'flat'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Daftar</span>
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'grouped'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Kelompokkan per Akun</span>
            </button>
          </div>
        </div>

        {/* Horizontal Scrollable Cashier Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
          <button
            onClick={() => setSelectedCashierFilter('all')}
            className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              selectedCashierFilter === 'all'
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                : 'bg-slate-950/40 text-slate-400 border-slate-800/60 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <UsersIcon className="w-3.5 h-3.5" />
            <span>Semua Akun</span>
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-800/80 text-slate-300">
              {transactions.length}
            </span>
          </button>

          {cashierAccounts.map((cashier) => {
            const isSelected = selectedCashierFilter === cashier.id;
            return (
              <button
                key={cashier.id}
                onClick={() => setSelectedCashierFilter(cashier.id)}
                className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                    : 'bg-slate-950/40 text-slate-400 border-slate-800/60 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span className="max-w-[140px] truncate">{cashier.name}</span>
                <span className="px-1.5 py-0.5 text-[10px] rounded-md font-semibold bg-indigo-950/40 text-indigo-300 border border-indigo-900/50">
                  {cashier.count} trx
                </span>
                {cashier.totalRevenue > 0 && (
                  <span className="text-[10px] font-bold text-emerald-400">
                    {formatMoney(cashier.totalRevenue)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Cashier Banner Indicator if single filter applied */}
        {activeCashierData && selectedCashierFilter !== 'all' && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-slate-300 font-semibold truncate">
                Menampilkan transaksi khusus: <span className="text-indigo-300">{activeCashierData.name}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-400">
                Omset Kasir: <strong className="text-emerald-400">{formatMoney(activeCashierData.totalRevenue)}</strong>
              </span>
              <button
                onClick={() => setSelectedCashierFilter('all')}
                className="text-indigo-400 hover:text-indigo-300 underline font-semibold"
              >
                Reset Filter
              </button>
            </div>
          </div>
        )}
      </section>

      {/* BOTTOM SECTION (TRANSAKSI & LAPORAN) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Transactions Section */}
        <div className="lg:col-span-2 backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col min-h-[560px]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" />
                {viewMode === 'grouped' ? 'Transaksi Dikelompokkan Per Akun' : 'Transaksi Live Hari Ini'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400">
                {viewMode === 'grouped'
                  ? 'Setiap kasir memiliki daftar urutan transaksinya masing-masing'
                  : 'Daftar urutan transaksi kronologis hari ini'}
              </p>
            </div>
            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Cari no. trx, kasir, status..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
              />
            </div>
          </div>

          {/* VIEW MODE: GROUPED PER AKUN KASIR */}
          {viewMode === 'grouped' ? (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {cashierAccounts.filter((c) => selectedCashierFilter === 'all' || c.id === selectedCashierFilter).length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">Tidak ada data akun kasir.</div>
              ) : (
                cashierAccounts
                  .filter((c) => selectedCashierFilter === 'all' || c.id === selectedCashierFilter)
                  .map((cashier) => {
                    const txList = cashier.transactions.filter((t) =>
                      (t.trx_number && t.trx_number.toLowerCase().includes(filterText.toLowerCase())) ||
                      t.payment_method.toLowerCase().includes(filterText.toLowerCase()) ||
                      t.status.toLowerCase().includes(filterText.toLowerCase())
                    );

                    return (
                      <div
                        key={cashier.id}
                        className="bg-slate-950/50 border border-slate-800/70 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-md"
                      >
                        {/* Header Kasir */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-800/60 gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate">{cashier.name}</h4>
                              <p className="text-[10px] text-slate-400">{cashier.count} Total Transaksi</p>
                            </div>
                          </div>

                          {/* Quick sub-stats per kasir */}
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="px-2 py-1 rounded-md bg-emerald-950/40 text-emerald-300 border border-emerald-900/50 font-semibold">
                              Total: {formatMoney(cashier.totalRevenue)}
                            </span>
                            <span className="px-2 py-1 rounded-md bg-blue-950/40 text-blue-300 border border-blue-900/50">
                              Tunai: {formatMoney(cashier.cashRevenue)}
                            </span>
                            <span className="px-2 py-1 rounded-md bg-violet-950/40 text-violet-300 border border-violet-900/50">
                              QRIS: {formatMoney(cashier.qrisRevenue)}
                            </span>
                          </div>
                        </div>

                        {/* List transaksi khusus kasir ini */}
                        {txList.length === 0 ? (
                          <div className="text-center py-6 text-slate-500 text-xs italic">
                            Belum ada transaksi yang cocok untuk akun kasir ini.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {txList.map((t) => (
                              <div
                                key={t.id}
                                className="bg-slate-900/40 border border-slate-800/40 rounded-lg p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs hover:border-slate-700/60 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="text-indigo-400 font-bold shrink-0">
                                    {t.cashier_seq_number ? `#${t.cashier_seq_number}` : (t.daily_queue_number ? `#${t.daily_queue_number}` : '-')}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-slate-200 truncate">{t.trx_number || 'PENDING'}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                                      <Clock className="w-3 h-3 text-slate-500" />
                                      <span>{toWIB(t.created_at)}</span>
                                      <span>•</span>
                                      <span>{t.order_type === 'dine_in' ? 'Dine In' : 'Takeaway'}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <div className="font-bold text-slate-100">{formatMoney(Number(t.amount))}</div>
                                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold mt-0.5 ${
                                      t.payment_method === 'QRIS'
                                        ? 'text-violet-400'
                                        : 'text-emerald-400'
                                    }`}>
                                      {t.payment_method}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleViewDetails(t)}
                                      className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                      title="Rincian"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTransaction(t.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                      title="Hapus"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          ) : (
            /* VIEW MODE: FLAT LIST (DAFTAR SEMUA/TERFILTER) */
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block flex-1 overflow-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 sticky top-0 backdrop-blur-sm z-10">
                    <tr>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">No. Urut</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">No. Trx</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Akun Kasir</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Metode</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Tipe</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Total</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider">Waktu</th>
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-16 text-slate-500">
                          Belum ada transaksi yang sesuai kriteria filter.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((t) => {
                        const cashierName = cashierMap[t.cashier_id || ''] || 'Sistem / Offline';
                        return (
                          <tr key={t.id} className="hover:bg-slate-900/40 transition-colors duration-150">
                            <td className="px-4 py-3 text-indigo-400 font-bold">
                              {t.cashier_seq_number ? `#${t.cashier_seq_number}` : (t.daily_queue_number ? `#${t.daily_queue_number}` : '-')}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-300">{t.trx_number || 'PENDING'}</td>
                            <td className="px-4 py-3 text-slate-300 font-medium max-w-[130px] truncate" title={cashierName}>
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/60 border border-slate-800 text-[11px]">
                                <User className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span className="truncate">{cashierName}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-[10px] ${
                                t.payment_method === 'QRIS'
                                  ? 'bg-violet-950/40 text-violet-300 border border-violet-900/50'
                                  : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50'
                              }`}>
                                {t.payment_method === 'QRIS' ? <QrCode className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                                {t.payment_method}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-[10px] ${
                                t.order_type === 'dine_in'
                                  ? 'bg-blue-950/40 text-blue-300 border border-blue-900/50'
                                  : 'bg-orange-950/40 text-orange-300 border border-orange-900/50'
                              }`}>
                                {t.order_type === 'dine_in' ? 'Dine In' : 'Takeaway'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-100">
                              <div>{formatMoney(Number(t.amount))}</div>
                              {t.additions && (
                                <div className="text-[10px] text-slate-500 font-normal mt-0.5" title={t.additions.split('+').map(x => Number(x).toLocaleString('id-ID')).join(' + ')}>
                                  {t.additions.split('+').map(x => Number(x).toLocaleString('id-ID')).join(' + ')}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[9px] ${
                                t.status === 'PAID'
                                  ? 'bg-green-950/30 text-green-400 border border-green-900/40'
                                  : t.status === 'FAILED'
                                  ? 'bg-red-950/30 text-red-400 border border-red-900/40'
                                  : 'bg-yellow-950/30 text-yellow-400 border border-yellow-900/40'
                              }`}>
                                {t.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{toWIB(t.created_at)}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleViewDetails(t)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                  title="Lihat Rincian"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTransaction(t.id)}
                                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                  title="Hapus Transaksi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View (Optimized for Mobile) */}
              <div className="flex-grow overflow-y-auto space-y-3 md:hidden pr-0.5">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-xs">Belum ada transaksi hari ini.</div>
                ) : (
                  filteredTransactions.map((t) => {
                    const cashierName = cashierMap[t.cashier_id || ''] || 'Sistem / Offline';
                    return (
                      <div key={t.id} className="bg-slate-950/40 border border-slate-800/70 rounded-xl p-3.5 space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-indigo-400 font-extrabold text-sm">
                              {t.cashier_seq_number ? `#${t.cashier_seq_number}` : (t.daily_queue_number ? `#${t.daily_queue_number}` : '-')}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800 max-w-[150px] truncate">
                              <User className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="truncate">{cashierName}</span>
                            </span>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold text-[9px] ${
                            t.status === 'PAID'
                              ? 'bg-green-950/30 text-green-400 border border-green-900/40'
                              : t.status === 'FAILED'
                              ? 'bg-red-950/30 text-red-400 border border-red-900/40'
                              : 'bg-yellow-950/30 text-yellow-400 border border-yellow-900/40'
                          }`}>
                            {t.status}
                          </span>
                        </div>

                        <div className="flex justify-between items-start text-xs gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 truncate">{t.trx_number || 'PENDING'}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>{toWIB(t.created_at)}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-slate-100 text-sm">{formatMoney(Number(t.amount))}</div>
                            {t.additions && (
                              <div className="text-[9px] text-slate-500 mt-0.5 font-mono">
                                +{t.additions.split('+').map(x => Number(x).toLocaleString('id-ID')).join(' + ')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px]">
                          <div className="flex gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                              t.payment_method === 'QRIS'
                                ? 'bg-violet-950/40 text-violet-300 border border-violet-900/50'
                                : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50'
                            }`}>
                              {t.payment_method}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                              t.order_type === 'dine_in'
                                ? 'bg-blue-950/40 text-blue-300 border border-blue-900/50'
                                : 'bg-orange-950/40 text-orange-300 border border-orange-900/50'
                            }`}>
                              {t.order_type === 'dine_in' ? 'Dine In' : 'Takeaway'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewDetails(t)}
                              className="px-2.5 py-1 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg font-semibold"
                            >
                              Detail
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(t.id)}
                              className="px-2.5 py-1 text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg font-semibold"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Reports Navigation & Distribution Card */}
        <div className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col justify-between min-h-[560px]">
          <div className="space-y-5">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-200 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Laporan Ringkas
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400">Pembagian metode pembayaran hari ini</p>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Tunai (CASH)</span>
                  <span className="font-bold text-emerald-400">{cashPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${cashPercent}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Digital (QRIS)</span>
                  <span className="font-bold text-violet-400">{qrisPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${qrisPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Cashier Revenue Ranking with Direct Click to Filter */}
            <div className="space-y-2.5 pt-3 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pendapatan Kasir Hari Ini
                </h4>
                <span className="text-[10px] text-slate-500">Klik untuk filter</span>
              </div>

              <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                {cashierAccounts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Belum ada data pendapatan kasir.</p>
                ) : (
                  cashierAccounts.map((cashier) => {
                    const isSelected = selectedCashierFilter === cashier.id;
                    return (
                      <button
                        key={cashier.id}
                        onClick={() => {
                          setSelectedCashierFilter(isSelected ? 'all' : cashier.id);
                        }}
                        className={`w-full text-left flex justify-between items-center rounded-xl px-3 py-2 text-xs border transition-all ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500/60 shadow-sm'
                            : 'bg-slate-950/40 border-slate-800/40 hover:border-slate-700'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-slate-200 font-medium truncate block max-w-[130px]" title={cashier.name}>
                            {cashier.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {cashier.paidCount} transaksi berhasil
                          </span>
                        </div>
                        <span className="font-bold text-indigo-400 shrink-0">
                          {formatMoney(cashier.totalRevenue)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 space-y-1.5">
              <div className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Klasifikasi Otomatis
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Transaksi secara otomatis diklasifikasikan berdasarkan akun kasir yang bertugas dan tersinkronisasi realtime.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/60">
            <Link
              href="/dashboard/reports"
              className="w-full py-2.5 px-4 flex items-center justify-center gap-2 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300 shadow-lg shadow-indigo-600/20 text-xs sm:text-sm"
            >
              Laporan & Riwayat Lengkap
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* MODAL DETAIL TRANSAKSI (RESPONSIF MOBILE / BOTTOM SHEET TOUCH) */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-400" />
                  Rincian Transaksi
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{selectedTx.trx_number || 'PENDING'}</p>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950/50 p-3.5 border border-slate-800/60 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Waktu Transaksi</span>
                  <span className="text-slate-300 font-semibold">{toWIB(selectedTx.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Metode Pembayaran</span>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full font-medium text-[10px] ${
                    selectedTx.payment_method === 'QRIS'
                      ? 'bg-violet-950/40 text-violet-300 border border-violet-900/50'
                      : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50'
                  }`}>
                    {selectedTx.payment_method === 'QRIS' ? <QrCode className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                    {selectedTx.payment_method}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">No. Urut Kasir</span>
                  <span className="text-indigo-400 font-extrabold text-sm">
                    {selectedTx.cashier_seq_number ? `#${selectedTx.cashier_seq_number}` : (selectedTx.daily_queue_number ? `#${selectedTx.daily_queue_number}` : '-')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Status</span>
                  <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-md font-semibold text-[9px] ${
                    selectedTx.status === 'PAID'
                      ? 'bg-green-950/30 text-green-400 border border-green-900/40'
                      : selectedTx.status === 'FAILED'
                      ? 'bg-red-950/30 text-red-400 border border-red-900/40'
                      : 'bg-yellow-950/30 text-yellow-400 border border-yellow-900/40'
                  }`}>
                    {selectedTx.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block text-[10px]">Akun Kasir Pemroses</span>
                  <span className="text-slate-200 font-semibold truncate block mt-0.5" title={cashierMap[selectedTx.cashier_id || ''] || 'Sistem / Offline'}>
                    {cashierMap[selectedTx.cashier_id || ''] || 'Sistem / Offline'}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Daftar Item</h4>
                
                {loadingItems ? (
                  <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mr-2" />
                    Memuat item...
                  </div>
                ) : txItems.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs border border-slate-800 border-dashed rounded-xl">
                    Tidak ada rincian item.
                  </div>
                ) : (
                  <div className="border border-slate-800/80 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2">Nama Produk</th>
                          <th className="px-2 py-2 text-center">Qty</th>
                          <th className="px-3 py-2 text-right">Harga</th>
                          <th className="px-3 py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-950/20 text-slate-300">
                        {txItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/20">
                            <td className="px-3 py-2 font-medium">{item.item_name}</td>
                            <td className="px-2 py-2 text-center">{item.qty}</td>
                            <td className="px-3 py-2 text-right">{formatMoney(Number(item.price))}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-100">{formatMoney(Number(item.price) * item.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Total & Action Footer */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-medium">Total Pembayaran</span>
                <span className="text-lg font-bold text-white">{formatMoney(Number(selectedTx.amount))}</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTx(null)}
                  className="flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 transition-all"
                >
                  Tutup
                </button>
                <button
                  onClick={() => handleDeleteTransaction(selectedTx.id)}
                  className="flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-all flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Transaksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
