'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  DollarSign,
  QrCode,
  RefreshCw,
  Search,
  Receipt,
  Users as UsersIcon,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Transaction {
  id: string;
  trx_number: string;
  amount: number;
  payment_method: 'CASH' | 'QRIS';
  status: 'PENDING' | 'PAID' | 'FAILED';
  daily_queue_number: number | null;
  created_at: string;
  additions?: string | null;
}

// Format timestamp to WIB
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

// Format date to YYYY-MM-DD in WIB
function getWIBDateString(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
}

function formatFriendlyDate(dateStr: string) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const d = new Date(year, month, day);
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterText, setFilterText] = useState('');
  const [filterRange, setFilterRange] = useState<'today' | '7days' | '1month' | 'custom'>('7days');
  const [expandedDates, setExpandedDates] = useState<{ [key: string]: boolean }>({});

  // Date picker states
  const todayStr = getWIBDateString(new Date());
  const [customStart, setCustomStart] = useState(todayStr);
  const [customEnd, setCustomEnd] = useState(todayStr);

  const [exporting, setExporting] = useState(false);

  // Fetch transactions based on date filter
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      let startStr = todayStr;
      let endStr = todayStr;

      if (filterRange === 'today') {
        startStr = todayStr;
        endStr = todayStr;
      } else if (filterRange === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        startStr = getWIBDateString(d);
        endStr = todayStr;
      } else if (filterRange === '1month') {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        startStr = getWIBDateString(d);
        endStr = todayStr;
      } else {
        startStr = customStart;
        endStr = customEnd;
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('created_at', `${startStr}T00:00:00+07:00`)
        .lte('created_at', `${endStr}T23:59:59+07:00`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions((data as Transaction[]) || []);
    } catch (e) {
      console.error('Failed to load reports:', e);
    } finally {
      setLoading(false);
    }
  }, [filterRange, customStart, customEnd, todayStr]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Aggregate stats
  const stats = (() => {
    let total = 0, cash = 0, qris = 0, count = 0;
    transactions.forEach((t) => {
      if (t.status === 'PAID') {
        const amt = Number(t.amount);
        total += amt;
        count++;
        if (t.payment_method === 'CASH') cash += amt;
        if (t.payment_method === 'QRIS') qris += amt;
      }
    });
    return { total, cash, qris, count };
  })();

  // Aggregate daily revenue for SVG chart
  const dailyData = (() => {
    const dailyMap: { [key: string]: { total: number; cash: number; qris: number } } = {};

    // Get dates in range
    let limit = 7;
    if (filterRange === 'today') limit = 1;
    else if (filterRange === '7days') limit = 7;
    else if (filterRange === '1month') limit = 30;
    else {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      limit = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }

    // Don't show more than 30 bars in chart to prevent cluttering
    const chartLimit = Math.min(30, limit);

    for (let i = chartLimit - 1; i >= 0; i--) {
      const d = new Date();
      if (filterRange === 'custom') {
        const end = new Date(customEnd);
        d.setDate(end.getDate() - i);
      } else {
        d.setDate(d.getDate() - i);
      }
      const dStr = getWIBDateString(d);
      dailyMap[dStr] = { total: 0, cash: 0, qris: 0 };
    }

    // Populate data
    transactions.forEach((t) => {
      if (t.status === 'PAID') {
        const tDate = t.created_at.substring(0, 10); // YYYY-MM-DD
        if (dailyMap[tDate] !== undefined) {
          const amt = Number(t.amount);
          dailyMap[tDate].total += amt;
          if (t.payment_method === 'CASH') dailyMap[tDate].cash += amt;
          if (t.payment_method === 'QRIS') dailyMap[tDate].qris += amt;
        }
      }
    });

    return Object.keys(dailyMap).map((date) => {
      // Format label to DD/MM
      const parts = date.split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
      return {
        date,
        label,
        total: dailyMap[date].total,
        cash: dailyMap[date].cash,
        qris: dailyMap[date].qris,
      };
    });
  })();

  // Find max daily total for scaling the chart
  const maxDailyVal = Math.max(...dailyData.map((d) => d.total), 100000);

  // Filtered transactions for the table search
  const filteredTransactions = transactions.filter((t) =>
    (t.trx_number && t.trx_number.toLowerCase().includes(filterText.toLowerCase())) ||
    t.payment_method.toLowerCase().includes(filterText.toLowerCase()) ||
    t.status.toLowerCase().includes(filterText.toLowerCase())
  );

  // Group transactions by date string YYYY-MM-DD (WIB)
  const groupedTransactions = (() => {
    const groups: { [dateStr: string]: Transaction[] } = {};
    filteredTransactions.forEach((t) => {
      const dateStr = getWIBDateString(new Date(t.created_at));
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(t);
    });
    // Sort dates descending
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((dateStr) => {
        const txs = groups[dateStr];
        let total = 0, cash = 0, qris = 0, count = 0;
        txs.forEach((t) => {
          if (t.status === 'PAID') {
            const amt = Number(t.amount);
            total += amt;
            count++;
            if (t.payment_method === 'CASH') cash += amt;
            if (t.payment_method === 'QRIS') qris += amt;
          }
        });
        return {
          dateStr,
          transactions: txs,
          total,
          cash,
          qris,
          count,
        };
      });
  })();

  const formatMoney = (val: number) => 'Rp ' + val.toLocaleString('id-ID');

  const handleExcelExport = async () => {
    setExporting(true);
    try {
      if (transactions.length === 0) {
        alert('Tidak ada data transaksi untuk diekspor.');
        return;
      }

      // Calculate start and end strings based on current filter range
      let startStr = todayStr;
      let endStr = todayStr;

      if (filterRange === 'today') {
        startStr = todayStr;
        endStr = todayStr;
      } else if (filterRange === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        startStr = getWIBDateString(d);
        endStr = todayStr;
      } else if (filterRange === '1month') {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        startStr = getWIBDateString(d);
        endStr = todayStr;
      } else {
        startStr = customStart;
        endStr = customEnd;
      }

      const isMultiDay = startStr !== endStr;

      if (isMultiDay) {
        // Group by Day (Daily Omset)
        const datesList: string[] = [];
        const current = new Date(startStr + 'T00:00:00+07:00');
        const end = new Date(endStr + 'T00:00:00+07:00');
        while (current <= end) {
          datesList.push(getWIBDateString(current));
          current.setDate(current.getDate() + 1);
        }

        // Initialize daily map
        const dailyMap: {
          [key: string]: {
            trxCount: number;
            cashAmount: number;
            qrisAmount: number;
            totalAmount: number;
          };
        } = {};
        datesList.forEach((d) => {
          dailyMap[d] = { trxCount: 0, cashAmount: 0, qrisAmount: 0, totalAmount: 0 };
        });

        // Aggregate PAID transactions
        transactions.forEach((t) => {
          if (t.status === 'PAID') {
            const tDate = t.created_at.substring(0, 10); // YYYY-MM-DD
            if (dailyMap[tDate]) {
              const amt = Number(t.amount);
              dailyMap[tDate].trxCount += 1;
              dailyMap[tDate].totalAmount += amt;
              if (t.payment_method === 'CASH') {
                dailyMap[tDate].cashAmount += amt;
              } else if (t.payment_method === 'QRIS') {
                dailyMap[tDate].qrisAmount += amt;
              }
            }
          }
        });

        let index = 1;
        interface DailyReportRow {
          'No': string | number;
          'Tanggal': string;
          'Transaksi Sukses': number;
          'Omset Tunai (IDR)': number;
          'Omset QRIS (IDR)': number;
          'Total Omset (IDR)': number;
        }

        const reportRows: DailyReportRow[] = datesList.map((date) => {
          const stats = dailyMap[date];
          const parts = date.split('-');
          const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;
          return {
            'No': index++,
            'Tanggal': formattedDate,
            'Transaksi Sukses': stats.trxCount,
            'Omset Tunai (IDR)': stats.cashAmount,
            'Omset QRIS (IDR)': stats.qrisAmount,
            'Total Omset (IDR)': stats.totalAmount,
          };
        });

        // Add total summary row
        const totalTrx = reportRows.reduce((sum, r) => sum + r['Transaksi Sukses'], 0);
        const totalCash = reportRows.reduce((sum, r) => sum + r['Omset Tunai (IDR)'], 0);
        const totalQris = reportRows.reduce((sum, r) => sum + r['Omset QRIS (IDR)'], 0);
        const totalOverall = reportRows.reduce((sum, r) => sum + r['Total Omset (IDR)'], 0);

        reportRows.push({
          'No': 'Total',
          'Tanggal': '',
          'Transaksi Sukses': totalTrx,
          'Omset Tunai (IDR)': totalCash,
          'Omset QRIS (IDR)': totalQris,
          'Total Omset (IDR)': totalOverall,
        });

        const worksheet = XLSX.utils.json_to_sheet(reportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Ringkasan Omset Harian');

        // Autofit columns
        worksheet['!cols'] = [
          { wch: 8 },  // No
          { wch: 15 }, // Tanggal
          { wch: 18 }, // Transaksi Sukses
          { wch: 20 }, // Omset Tunai (IDR)
          { wch: 20 }, // Omset QRIS (IDR)
          { wch: 20 }, // Total Omset (IDR)
        ];

        const rangeLabel = filterRange === 'custom' ? `${customStart}_to_${customEnd}` : filterRange;
        XLSX.writeFile(workbook, `loftPOS_Laporan_Harian_${rangeLabel}.xlsx`);
      } else {
        // Single Day: Export details per transaction
        interface SingleDayReportRow {
          'No': string | number;
          'No Trx': string;
          'No Antrian': string | number;
          'Jumlah (IDR)': number;
          'Metode': string;
          'Status': string;
          'Waktu (WIB)': string;
        }

        const reportRows: SingleDayReportRow[] = transactions.map((t, index) => ({
          'No': index + 1,
          'No Trx': t.trx_number || 'N/A',
          'No Antrian': t.daily_queue_number || '-',
          'Jumlah (IDR)': Number(t.amount),
          'Metode': t.payment_method,
          'Status': t.status,
          'Waktu (WIB)': toWIB(t.created_at),
        }));

        // Calculate total PAID omset
        const totalPaidOmset = transactions
          .filter(t => t.status === 'PAID')
          .reduce((sum, t) => sum + Number(t.amount), 0);

        reportRows.push({
          'No': 'Total PAID',
          'No Trx': '',
          'No Antrian': '',
          'Jumlah (IDR)': totalPaidOmset,
          'Metode': '',
          'Status': '',
          'Waktu (WIB)': '',
        });

        const worksheet = XLSX.utils.json_to_sheet(reportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Detail Transaksi Harian');

        // Autofit columns
        worksheet['!cols'] = [
          { wch: 12 }, // No
          { wch: 22 }, // No Trx
          { wch: 10 }, // No Antrian
          { wch: 16 }, // Jumlah (IDR)
          { wch: 10 }, // Metode
          { wch: 10 }, // Status
          { wch: 22 }, // Waktu (WIB)
        ];

        const rangeLabel = filterRange === 'custom' ? `${customStart}_to_${customEnd}` : filterRange;
        XLSX.writeFile(workbook, `loftPOS_Detail_Transaksi_${rangeLabel}.xlsx`);
      }
    } catch (e) {
      alert(`Export gagal: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            Laporan Keuangan
          </h2>
          <p className="text-sm text-slate-400 mt-1">Pantau performa omset dan riwayat penjualan</p>
        </div>

        {/* Filter Buttons & Export */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex gap-1 text-xs">
            <button
              onClick={() => setFilterRange('today')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterRange === 'today' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setFilterRange('7days')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterRange === '7days' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 Hari
            </button>
            <button
              onClick={() => setFilterRange('1month')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterRange === '1month' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1 Bulan
            </button>
            <button
              onClick={() => setFilterRange('custom')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterRange === 'custom' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kustom
            </button>
          </div>

          <button
            onClick={handleExcelExport}
            disabled={loading || exporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all duration-200 shadow-lg shadow-indigo-600/20"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Ekspor Excel
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker Form */}
      {filterRange === 'custom' && (
        <div className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex flex-wrap gap-4 items-end animate-fadeIn">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Tanggal Mulai</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Tanggal Akhir</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>
          <button
            onClick={fetchReportData}
            className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-300 font-semibold rounded-lg text-xs transition-all"
          >
            Terapkan Filter
          </button>
        </div>
      )}

      {/* STATS SUMMARY CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omset */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Omset</span>
            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400"><TrendingUp className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{formatMoney(stats.total)}</h2>
          <p className="text-[10px] text-slate-500 mt-1">Pada rentang waktu terpilih</p>
        </div>

        {/* Total Transaksi */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Transaksi</span>
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400"><UsersIcon className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{stats.count}</h2>
          <p className="text-[10px] text-slate-500 mt-1">Transaksi sukses tercatat</p>
        </div>

        {/* CASH */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Omset Cash</span>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400"><DollarSign className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{formatMoney(stats.cash)}</h2>
          <p className="text-[10px] text-slate-500 mt-1">Total pembayaran tunai</p>
        </div>

        {/* QRIS */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Omset QRIS</span>
            <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-400"><QrCode className="w-4 h-4" /></div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">{formatMoney(stats.qris)}</h2>
          <p className="text-[10px] text-slate-500 mt-1">Total pembayaran digital</p>
        </div>
      </section>

      {/* REVENUE TREND CHART (SVG) */}
      <section className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-200">Tren Penjualan Harian</h3>
          <p className="text-xs text-slate-400">Grafik omset harian dalam rentang waktu yang dipilih</p>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mr-2" />
            <span className="text-sm text-slate-400">Memproses grafik...</span>
          </div>
        ) : dailyData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
            Tidak ada data omset untuk ditampilkan pada grafik.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            {/* SVG Chart Container */}
            <div className="min-w-[600px] h-72 relative">
              <svg className="w-full h-full" viewBox="0 0 800 240" preserveAspectRatio="none">
                {/* Horizontal Guide Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => (
                  <line
                    key={idx}
                    x1="40"
                    y1={20 + ratio * 160}
                    x2="780"
                    y2={20 + ratio * 160}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Y-Axis Labels */}
                {[1, 0.75, 0.5, 0.25, 0].map((ratio, idx) => {
                  const val = Math.round(maxDailyVal * ratio);
                  let label = val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${Math.round(val / 1000)}k` : `${val}`;
                  if (val === 0) label = '0';
                  return (
                    <text
                      key={idx}
                      x="32"
                      y={24 + (1 - ratio) * 160}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {label}
                    </text>
                  );
                })}

                {/* Chart Bars */}
                {dailyData.map((d, index) => {
                  const barWidth = Math.max(12, Math.min(32, 600 / dailyData.length));
                  const gap = (740 - dailyData.length * barWidth) / (dailyData.length + 1);
                  const x = 50 + gap + index * (barWidth + gap);

                  // Scale height (max height is 160px)
                  const totalHeight = (d.total / maxDailyVal) * 160;
                  const cashHeight = (d.cash / maxDailyVal) * 160;
                  const qrisHeight = (d.qris / maxDailyVal) * 160;

                  const yTotal = 180 - totalHeight;

                  return (
                    <g key={index} className="group cursor-pointer">
                      {/* Bar Stack - CASH */}
                      {d.cash > 0 && (
                        <rect
                          x={x}
                          y={180 - cashHeight}
                          width={barWidth}
                          height={cashHeight}
                          fill="#10b981"
                          opacity="0.85"
                          className="hover:opacity-100 transition-opacity duration-150"
                        />
                      )}
                      {/* Bar Stack - QRIS */}
                      {d.qris > 0 && (
                        <rect
                          x={x}
                          y={180 - cashHeight - qrisHeight}
                          width={barWidth}
                          height={qrisHeight}
                          fill="#6366f1"
                          opacity="0.85"
                          className="hover:opacity-100 transition-opacity duration-150"
                        />
                      )}

                      {/* Tooltip Hover Value */}
                      <text
                        x={x + barWidth / 2}
                        y={Math.max(15, yTotal - 6)}
                        fill="#ffffff"
                        fontSize="8"
                        fontWeight="bold"
                        textAnchor="middle"
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-slate-950"
                      >
                        {d.total >= 1000 ? `${Math.round(d.total / 1000)}k` : `${d.total}`}
                      </text>

                      {/* X-Axis Labels */}
                      <text
                        x={x + barWidth / 2}
                        y="198"
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="middle"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}

                {/* Base Line */}
                <line x1="40" y1="180" x2="780" y2="180" stroke="#334155" strokeWidth="1" />
              </svg>
            </div>
            {/* Chart Legend */}
            <div className="flex justify-center gap-6 text-[10px] text-slate-400 pt-2 border-t border-slate-800/40">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                <span>Cash / Tunai</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-indigo-500 rounded-sm" />
                <span>QRIS / Digital</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* DETAILED TRANSACTIONS LIST */}
      <section className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-indigo-400" />
              Rincian Transaksi
            </h3>
            <p className="text-xs text-slate-400">Menampilkan {filteredTransactions.length} dari total {transactions.length} transaksi</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Expand / Collapse Controls */}
            {filteredTransactions.length > 0 && filterText.trim() === '' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allExpanded: { [key: string]: boolean } = {};
                    groupedTransactions.forEach((g) => {
                      allExpanded[g.dateStr] = true;
                    });
                    setExpandedDates(allExpanded);
                  }}
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/5 hover:bg-indigo-500/10 px-2.5 py-1.5 rounded-lg border border-indigo-500/10"
                >
                  Buka Semua
                </button>
                <button
                  onClick={() => setExpandedDates({})}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-300 transition-colors bg-slate-800/40 hover:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-700/40"
                >
                  Tutup Semua
                </button>
              </div>
            )}

            <div className="relative max-w-xs w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Cari transaksi..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-slate-400 border border-slate-800/50 rounded-xl bg-slate-950/20">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-500 inline-block mr-2" />
              Memuat rincian transaksi...
            </div>
          ) : groupedTransactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-slate-800/50 rounded-xl bg-slate-950/20">
              Tidak ada transaksi ditemukan.
            </div>
          ) : (
            groupedTransactions.map((group) => {
              const isExpanded = filterText.trim() !== '' ? true : !!expandedDates[group.dateStr];

              return (
                <div
                  key={group.dateStr}
                  className={`backdrop-blur-md border rounded-xl overflow-hidden transition-all duration-200 ${
                    isExpanded
                      ? 'bg-slate-900/40 border-indigo-500/20 shadow-lg'
                      : 'bg-slate-900/20 border-slate-800/80 hover:border-slate-700/60'
                  }`}
                >
                  {/* Accordion Header */}
                  <div
                    onClick={() => {
                      if (filterText.trim() === '') {
                        setExpandedDates((prev) => ({
                          ...prev,
                          [group.dateStr]: !prev[group.dateStr],
                        }));
                      }
                    }}
                    className={`w-full px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-left transition-colors duration-150 cursor-pointer ${
                      isExpanded ? 'bg-slate-900/60 border-b border-slate-800/60' : 'bg-transparent'
                    }`}
                  >
                    {/* Left: Friendly Date & Trx Count */}
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-200 text-xs md:text-sm tracking-wide">
                        {formatFriendlyDate(group.dateStr)}
                      </span>
                      <span className="px-2 py-0.5 text-[9px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                        {group.transactions.length} Trx
                      </span>
                    </div>

                    {/* Middle: Omset Summary */}
                    <div className="flex flex-wrap items-center gap-2.5 text-[10px] md:text-xs text-slate-400">
                      {group.cash > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 font-semibold">
                          <DollarSign className="w-3 h-3" />
                          Cash: {formatMoney(group.cash)}
                        </span>
                      )}
                      {group.qris > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-950/30 text-indigo-400 border border-indigo-900/40 font-semibold">
                          <QrCode className="w-3 h-3" />
                          QRIS: {formatMoney(group.qris)}
                        </span>
                      )}
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/50 text-white border border-slate-700/50 font-bold">
                        Omset: {formatMoney(group.total)}
                      </span>
                    </div>

                    {/* Right: Expand/Collapse indicator */}
                    <div className="flex items-center justify-end text-slate-500">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {isExpanded && (
                    <div className="overflow-x-auto bg-slate-950/10">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800/80">
                          <tr>
                            <th className="px-4 py-2.5">#</th>
                            <th className="px-4 py-2.5">No Trx</th>
                            <th className="px-4 py-2.5">Metode</th>
                            <th className="px-4 py-2.5">Jumlah</th>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5">Waktu (WIB)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {group.transactions.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-900/30 transition-colors duration-150">
                              <td className="px-4 py-2.5 text-indigo-400 font-bold">
                                {t.daily_queue_number ? `#${t.daily_queue_number}` : '-'}
                              </td>
                              <td className="px-4 py-2.5 font-bold text-slate-300">
                                {t.trx_number || 'PENDING'}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium text-[10px] ${
                                  t.payment_method === 'QRIS'
                                    ? 'bg-violet-950/40 text-violet-300 border border-violet-900/50'
                                    : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50'
                                }`}>
                                  {t.payment_method === 'QRIS' ? <QrCode className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                                  {t.payment_method}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-slate-100">
                                <div>{formatMoney(Number(t.amount))}</div>
                                {t.additions && (
                                  <div className="text-[10px] text-slate-500 font-normal mt-0.5" title={t.additions.split('+').map(x => Number(x).toLocaleString('id-ID')).join(' + ')}>
                                    {t.additions.split('+').map(x => Number(x).toLocaleString('id-ID')).join(' + ')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
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
                              <td className="px-4 py-2.5 text-slate-400">{toWIB(t.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
