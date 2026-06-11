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
} from 'lucide-react';
import Link from 'next/link';

interface Transaction {
  id: string;
  trx_number: string;
  amount: number;
  payment_method: 'CASH' | 'QRIS';
  status: 'PENDING' | 'PAID' | 'FAILED';
  daily_queue_number: number | null;
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterText, setFilterText] = useState('');
  const [cashierMap, setCashierMap] = useState<{[id: string]: string}>({});

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
      const startOfToday = `${todayStr}T00:00:00+07:00`;
      const endOfToday = `${todayStr}T23:59:59+07:00`;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', startOfToday)
        .lte('created_at', endOfToday)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTransactions(data as Transaction[]);
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
              return [newTrx, ...prev];
            });
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedTrx = payload.new as Transaction;
          setTransactions((prev) => {
            if (isTodayWIB(updatedTrx.created_at)) {
              return prev.map((t) => (t.id === updatedTrx.id ? updatedTrx : t));
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

  const filteredTransactions = transactions.filter((t) =>
    (t.trx_number && t.trx_number.toLowerCase().includes(filterText.toLowerCase())) ||
    t.payment_method.toLowerCase().includes(filterText.toLowerCase()) ||
    t.status.toLowerCase().includes(filterText.toLowerCase())
  );

  const formatMoney = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  const cashPercent = todayStats.total > 0 ? Math.round((todayStats.cash / todayStats.total) * 100) : 0;
  const qrisPercent = todayStats.total > 0 ? Math.round((todayStats.qris / todayStats.total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <div className="flex flex-col items-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
          <p className="text-sm text-slate-400">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* STATS CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Omset Hari Ini</span>
            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400"><TrendingUp className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{formatMoney(todayStats.total)}</h2>
          <p className="text-[10px] text-indigo-400 mt-1 flex items-center gap-1 font-medium"><span>●</span> Realtime</p>
        </div>

        {/* Customer count */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pelanggan Hari Ini</span>
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400"><UsersIcon className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{todayStats.count}</h2>
          <div className="flex gap-2 mt-1">
            <p className="text-[10px] text-blue-400 flex items-center gap-1 font-medium"><span>●</span> Dine In: {todayStats.dineIn}</p>
            <p className="text-[10px] text-orange-400 flex items-center gap-1 font-medium"><span>●</span> Takeaway: {todayStats.takeaway}</p>
          </div>
        </div>

        {/* Cash */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cash</span>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400"><DollarSign className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{formatMoney(todayStats.cash)}</h2>
        </div>

        {/* QRIS */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">QRIS</span>
            <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-400"><QrCode className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{formatMoney(todayStats.qris)}</h2>
        </div>
      </section>

      {/* BOTTOM SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions Table */}
        <div className="lg:col-span-2 backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col h-[520px]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" />
                Transaksi Live Hari Ini
              </h3>
              <p className="text-xs text-slate-400">Hanya menampilkan transaksi pada hari ini saja</p>
            </div>
            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Filter transaksi..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto rounded-lg border border-slate-800">
             <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider">Antrean</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider">No. Trx</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider">Kasir</th>
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
                    <td colSpan={7} className="text-center py-12 text-slate-500">Belum ada transaksi hari ini.</td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/30 transition-colors duration-150">
                      <td className="px-4 py-3 text-indigo-400 font-bold">{t.daily_queue_number ? `#${t.daily_queue_number}` : '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-300">{t.trx_number || 'PENDING'}</td>
                      <td className="px-4 py-3 text-slate-300 font-medium truncate max-w-[120px]" title={cashierMap[t.cashier_id || ''] || 'Sistem / Tanpa Kasir'}>
                        {cashierMap[t.cashier_id || ''] || 'Sistem / Tanpa Kasir'}
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
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/5 rounded-lg transition-colors"
                            title="Lihat Rincian"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/5 rounded-lg transition-colors"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reports Navigation & Distribution Card */}
        <div className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between h-[520px]">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Laporan Ringkas
              </h3>
              <p className="text-xs text-slate-400">Pembagian metode pembayaran hari ini</p>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Tunai (CASH)</span>
                  <span className="font-bold text-emerald-400">{cashPercent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${cashPercent}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Digital (QRIS)</span>
                  <span className="font-bold text-violet-400">{qrisPercent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 transition-all duration-500" style={{ width: `${qrisPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Cashier Revenue Stats */}
            <div className="space-y-3 pt-4 border-t border-slate-800/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Pendapatan Kasir Hari Ini
              </h4>
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {Object.keys(todayStats.cashierRevenue).length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Belum ada data pendapatan kasir.</p>
                ) : (
                  Object.entries(todayStats.cashierRevenue)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cid, revenue]) => {
                      const email = cashierMap[cid] || (cid === 'system' ? 'Sistem / Tanpa Kasir' : 'Tidak Diketahui');
                      return (
                        <div key={cid} className="flex justify-between items-center bg-slate-950/40 border border-slate-800/40 rounded-xl px-3 py-2 text-xs">
                          <span className="text-slate-300 font-medium truncate max-w-[150px]" title={email}>
                            {email}
                          </span>
                          <span className="font-bold text-indigo-400">{formatMoney(revenue)}</span>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 space-y-2">
              <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Catatan Hari Ini</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Tabel di samping hanya menampilkan transaksi yang dicatat pada hari ini. Transaksi sebelum hari ini secara otomatis diarsipkan ke sistem laporan keuangan.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800/60">
            <Link
              href="/dashboard/reports"
              className="w-full py-3 px-4 flex items-center justify-center gap-2 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300 shadow-lg shadow-indigo-600/20"
            >
              Laporan & Riwayat Lengkap
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Modal Detail Transaksi */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-400" />
                  Rincian Transaksi
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedTx.trx_number || 'PENDING'}</p>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-4 bg-slate-950/40 p-4 border border-slate-800/60 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 block">Waktu Transaksi</span>
                  <span className="text-slate-300 font-semibold">{toWIB(selectedTx.created_at)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Metode Pembayaran</span>
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
                  <span className="text-slate-500 block">Nomor Antrean</span>
                  <span className="text-indigo-400 font-bold">{selectedTx.daily_queue_number ? `#${selectedTx.daily_queue_number}` : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Status</span>
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
                <div>
                  <span className="text-slate-500 block">Kasir</span>
                  <span className="text-slate-300 font-semibold truncate block" title={cashierMap[selectedTx.cashier_id || ''] || 'Sistem / Tanpa Kasir'}>
                    {cashierMap[selectedTx.cashier_id || ''] || 'Sistem / Tanpa Kasir'}
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
                  <div className="text-center py-8 text-slate-500 text-xs border border-slate-800 border-dashed rounded-xl">
                    Tidak ada rincian item.
                  </div>
                ) : (
                  <div className="border border-slate-800/80 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-2">Nama Produk</th>
                          <th className="px-4 py-2 text-center">Qty</th>
                          <th className="px-4 py-2 text-right">Harga</th>
                          <th className="px-4 py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 bg-slate-950/20 text-slate-300">
                        {txItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/20">
                            <td className="px-4 py-2 font-medium">{item.item_name}</td>
                            <td className="px-4 py-2 text-center">{item.qty}</td>
                            <td className="px-4 py-2 text-right">{formatMoney(Number(item.price))}</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-100">{formatMoney(Number(item.price) * item.qty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Total & Action Footer */}
            <div className="pt-4 border-t border-slate-800 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-medium">Total Pembayaran</span>
                <span className="text-lg font-bold text-white">{formatMoney(Number(selectedTx.amount))}</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTx(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 transition-all"
                >
                  Tutup
                </button>
                <button
                  onClick={() => handleDeleteTransaction(selectedTx.id)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition-all flex items-center justify-center gap-1.5"
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
