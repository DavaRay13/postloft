'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ExcelJS from 'exceljs';
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
  Trash2,
  Eye,
  X,
  Loader2,
  Filter,
  SlidersHorizontal,
  ArrowRight,
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
  cashier_id?: string | null;
  order_type?: 'dine_in' | 'takeaway' | null;
}

interface TransactionItem {
  id: string;
  transaction_id: string;
  item_name: string;
  qty: number;
  price: number;
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
  const [filterRange, setFilterRange] = useState<'today' | '7days' | 'thisMonth' | '30days' | 'custom'>('7days');
  const [expandedDates, setExpandedDates] = useState<{ [key: string]: boolean }>({});
  const [cashierMap, setCashierMap] = useState<{[id: string]: string}>({});
  const [selectedCashierFilter, setSelectedCashierFilter] = useState<string>('all');
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);

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

  // Date picker states
  const todayStr = getWIBDateString(new Date());
  const [customStart, setCustomStart] = useState(todayStr);
  const [customEnd, setCustomEnd] = useState(todayStr);

  const [exporting, setExporting] = useState(false);

  // Helper to compute start & end YYYY-MM-DD for a filter range
  const getDateRangeStrings = useCallback((range: 'today' | '7days' | 'thisMonth' | '30days' | 'custom') => {
    let startStr = todayStr;
    let endStr = todayStr;

    if (range === 'today') {
      startStr = todayStr;
      endStr = todayStr;
    } else if (range === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      startStr = getWIBDateString(d);
      endStr = todayStr;
    } else if (range === 'thisMonth') {
      const parts = todayStr.split('-');
      if (parts.length === 3) {
        startStr = `${parts[0]}-${parts[1]}-01`;
      } else {
        startStr = todayStr;
      }
      endStr = todayStr;
    } else if (range === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      startStr = getWIBDateString(d);
      endStr = todayStr;
    } else {
      startStr = customStart;
      endStr = customEnd;
    }

    return { startStr, endStr };
  }, [todayStr, customStart, customEnd]);

  // Fetch transactions based on date filter with chunked bulk fetching (prevents 1,000 postgrest limit)
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const { startStr, endStr } = getDateRangeStrings(filterRange);

      let allData: Transaction[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .gte('created_at', `${startStr}T00:00:00+07:00`)
          .lte('created_at', `${endStr}T23:59:59+07:00`)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;
        if (data && data.length > 0) {
          allData = allData.concat(data as Transaction[]);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      setTransactions(allData);
    } catch (e) {
      console.error('Failed to load reports:', e);
    } finally {
      setLoading(false);
    }
  }, [filterRange, getDateRangeStrings]);

  useEffect(() => {
    const fetchCashiers = async () => {
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
    };
    fetchCashiers();
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Aggregate stats
  const stats = (() => {
    let total = 0, cash = 0, qris = 0, count = 0;
    const cashierRevenue: { [cashierId: string]: number } = {};

    transactions.forEach((t) => {
      if (t.status === 'PAID') {
        const amt = Number(t.amount);
        const cid = t.cashier_id || 'system';
        cashierRevenue[cid] = (cashierRevenue[cid] || 0) + amt;

        const matchesCashier = 
          selectedCashierFilter === 'all' ||
          (selectedCashierFilter === 'system' && !t.cashier_id) ||
          t.cashier_id === selectedCashierFilter;

        if (matchesCashier) {
          total += amt;
          count++;
          if (t.payment_method === 'CASH') cash += amt;
          if (t.payment_method === 'QRIS') qris += amt;
        }
      }
    });
    return { total, cash, qris, count, cashierRevenue };
  })();

  // Aggregate daily revenue for SVG chart
  const dailyData = (() => {
    const dailyMap: { [key: string]: { total: number; cash: number; qris: number } } = {};

    const { startStr, endStr } = getDateRangeStrings(filterRange);
    const startDate = new Date(startStr + 'T00:00:00+07:00');
    const endDate = new Date(endStr + 'T00:00:00+07:00');
    const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // Don't show more than 31 bars in chart to prevent cluttering
    const chartLimit = Math.min(31, totalDays);

    for (let i = chartLimit - 1; i >= 0; i--) {
      const d = new Date(endDate.getTime());
      d.setDate(d.getDate() - i);
      const dStr = getWIBDateString(d);
      dailyMap[dStr] = { total: 0, cash: 0, qris: 0 };
    }

    // Populate data
    transactions.forEach((t) => {
      if (t.status === 'PAID') {
        const matchesCashier = 
          selectedCashierFilter === 'all' ||
          (selectedCashierFilter === 'system' && !t.cashier_id) ||
          t.cashier_id === selectedCashierFilter;

        if (matchesCashier) {
          const tDate = getWIBDateString(new Date(t.created_at));
          if (dailyMap[tDate] !== undefined) {
            const amt = Number(t.amount);
            dailyMap[tDate].total += amt;
            if (t.payment_method === 'CASH') dailyMap[tDate].cash += amt;
            if (t.payment_method === 'QRIS') dailyMap[tDate].qris += amt;
          }
        }
      }
    });

    return Object.keys(dailyMap).sort().map((date) => {
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
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch = 
      (t.trx_number && t.trx_number.toLowerCase().includes(filterText.toLowerCase())) ||
      t.payment_method.toLowerCase().includes(filterText.toLowerCase()) ||
      t.status.toLowerCase().includes(filterText.toLowerCase());

    const matchesCashier = 
      selectedCashierFilter === 'all' ||
      (selectedCashierFilter === 'system' && !t.cashier_id) ||
      t.cashier_id === selectedCashierFilter;

    return matchesSearch && matchesCashier;
  });

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
      if (filteredTransactions.length === 0) {
        alert('Tidak ada data transaksi untuk diekspor.');
        return;
      }

      const { startStr, endStr } = getDateRangeStrings(filterRange);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Seblak Sulthan POS System';
      workbook.created = new Date();

      // ==========================================
      // SHEET 1: RINGKASAN LAPORAN OMSET & KPIS
      // ==========================================
      const sheet1 = workbook.addWorksheet('Ringkasan Omset Harian');
      sheet1.views = [{ showGridLines: true }];

      // Header Banner Title (Row 1-2)
      sheet1.mergeCells('A1:F1');
      const titleCell = sheet1.getCell('A1');
      titleCell.value = 'LAPORAN KEUANGAN & PENJUALAN - SEBLAK SULTHAN';
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4F46E5' } }; // Indigo 600
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const rangeLabel = filterRange === 'today' ? 'Hari Ini' 
        : filterRange === '7days' ? '7 Hari Terakhir'
        : filterRange === 'thisMonth' ? 'Bulan Ini (Kalender)'
        : filterRange === '30days' ? '30 Hari Terakhir'
        : `Kustom (${startStr} s.d. ${endStr})`;

      sheet1.mergeCells('A2:F2');
      const subTitleCell = sheet1.getCell('A2');
      subTitleCell.value = `Periode: ${rangeLabel} | Tanggal Ekspor: ${toWIB(new Date().toISOString())}`;
      subTitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: '3730A3' } };
      subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0E7FF' } }; // Indigo 100
      subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      sheet1.getRow(1).height = 30;
      sheet1.getRow(2).height = 20;
      sheet1.getRow(3).height = 10; // Empty spacer

      // Summary KPI Section (Row 4-5)
      let totalPaidCount = 0;
      let totalPaidCash = 0;
      let totalPaidQris = 0;
      let totalPaidAmount = 0;

      filteredTransactions.forEach((t) => {
        if (t.status === 'PAID') {
          totalPaidCount++;
          const amt = Number(t.amount);
          totalPaidAmount += amt;
          if (t.payment_method === 'CASH') totalPaidCash += amt;
          if (t.payment_method === 'QRIS') totalPaidQris += amt;
        }
      });

      // KPI Card Headers (Row 4)
      const kpiRow1 = sheet1.getRow(4);
      kpiRow1.values = ['Total Omset', '', 'Total Transaksi', '', 'Omset Tunai (CASH)', 'Omset Digital (QRIS)'];
      kpiRow1.height = 18;

      sheet1.mergeCells('A4:B4');
      sheet1.mergeCells('C4:D4');

      ['A4', 'C4', 'E4', 'F4'].forEach((cellRef) => {
        const cell = sheet1.getCell(cellRef);
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '475569' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      // KPI Card Values (Row 5)
      const kpiRow2 = sheet1.getRow(5);
      kpiRow2.values = [totalPaidAmount, '', totalPaidCount, '', totalPaidCash, totalPaidQris];
      kpiRow2.height = 24;

      sheet1.mergeCells('A5:B5');
      sheet1.mergeCells('C5:D5');

      const setKpiValueStyle = (cellRef: string, numFormat?: string, fontColor = '0F172A') => {
        const cell = sheet1.getCell(cellRef);
        cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: fontColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (numFormat) cell.numFmt = numFormat;
      };

      setKpiValueStyle('A5', '"Rp "#,##0', '4F46E5');
      setKpiValueStyle('C5', '#,##0', 'D97706');
      setKpiValueStyle('E5', '"Rp "#,##0', '059669');
      setKpiValueStyle('F5', '"Rp "#,##0', '7C3AED');

      sheet1.getRow(6).height = 12; // Empty spacer

      // Table Header (Row 7)
      const headers1 = ['No', 'Tanggal', 'Transaksi Sukses', 'Omset Tunai (IDR)', 'Omset QRIS (IDR)', 'Total Omset (IDR)'];
      const headerRow1 = sheet1.getRow(7);
      headerRow1.values = headers1;
      headerRow1.height = 25;

      headerRow1.eachCell((cell: ExcelJS.Cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } }; // Slate 800
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: '334155' } },
          left: { style: 'thin', color: { argb: '334155' } },
          bottom: { style: 'medium', color: { argb: '0F172A' } },
          right: { style: 'thin', color: { argb: '334155' } },
        };
      });

      // Build daily data list
      const datesList: string[] = [];
      const current = new Date(startStr + 'T00:00:00+07:00');
      const endDateObj = new Date(endStr + 'T00:00:00+07:00');
      while (current <= endDateObj) {
        datesList.push(getWIBDateString(current));
        current.setDate(current.getDate() + 1);
      }

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

      filteredTransactions.forEach((t) => {
        if (t.status === 'PAID') {
          const tDate = getWIBDateString(new Date(t.created_at));
          if (dailyMap[tDate]) {
            const amt = Number(t.amount);
            dailyMap[tDate].trxCount += 1;
            dailyMap[tDate].totalAmount += amt;
            if (t.payment_method === 'CASH') dailyMap[tDate].cashAmount += amt;
            if (t.payment_method === 'QRIS') dailyMap[tDate].qrisAmount += amt;
          }
        }
      });

      let currentRowIdx = 8;
      let rowCounter = 1;

      datesList.forEach((date) => {
        const stats = dailyMap[date];
        const parts = date.split('-');
        const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;

        const dataRow = sheet1.getRow(currentRowIdx);
        dataRow.values = [
          rowCounter++,
          formattedDate,
          stats.trxCount,
          stats.cashAmount,
          stats.qrisAmount,
          stats.totalAmount,
        ];
        dataRow.height = 20;

        const isEven = rowCounter % 2 === 0;
        const bgPattern = isEven ? 'F8FAFC' : 'FFFFFF';

        dataRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        dataRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        dataRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
        dataRow.getCell(3).numFmt = '#,##0';

        [4, 5, 6].forEach((colIdx) => {
          const c = dataRow.getCell(colIdx);
          c.alignment = { horizontal: 'right', vertical: 'middle' };
          c.numFmt = '"Rp "#,##0';
        });

        for (let col = 1; col <= 6; col++) {
          const cell = dataRow.getCell(col);
          cell.font = { name: 'Arial', size: 9.5 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgPattern } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E2E8F0' } },
            left: { style: 'thin', color: { argb: 'E2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
            right: { style: 'thin', color: { argb: 'E2E8F0' } },
          };
        }

        currentRowIdx++;
      });

      // Total Row at bottom
      const totalRow = sheet1.getRow(currentRowIdx);
      totalRow.values = [
        'Total',
        '',
        totalPaidCount,
        totalPaidCash,
        totalPaidQris,
        totalPaidAmount,
      ];
      totalRow.height = 24;
      sheet1.mergeCells(`A${currentRowIdx}:B${currentRowIdx}`);

      totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      totalRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.getCell(3).numFmt = '#,##0';

      [4, 5, 6].forEach((colIdx) => {
        const c = totalRow.getCell(colIdx);
        c.alignment = { horizontal: 'right', vertical: 'middle' };
        c.numFmt = '"Rp "#,##0';
      });

      for (let col = 1; col <= 6; col++) {
        const cell = totalRow.getCell(col);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '1E1B4B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FF' } }; // Soft Indigo
        cell.border = {
          top: { style: 'medium', color: { argb: '4F46E5' } },
          bottom: { style: 'double', color: { argb: '4F46E5' } },
          left: { style: 'thin', color: { argb: 'C7D2FE' } },
          right: { style: 'thin', color: { argb: 'C7D2FE' } },
        };
      }

      // Column widths for Sheet 1
      sheet1.columns = [
        { width: 8 },  // No
        { width: 16 }, // Tanggal
        { width: 20 }, // Transaksi Sukses
        { width: 22 }, // Omset Tunai (IDR)
        { width: 22 }, // Omset QRIS (IDR)
        { width: 24 }, // Total Omset (IDR)
      ];

      // ==========================================
      // SHEET 2: DETAIL SELURUH TRANSAKSI
      // ==========================================
      const sheet2 = workbook.addWorksheet('Detail Seluruh Transaksi');
      sheet2.views = [{ showGridLines: true }];

      // Title Banner Sheet 2
      sheet2.mergeCells('A1:I1');
      const titleCell2 = sheet2.getCell('A1');
      titleCell2.value = 'RINCIAN DETAIL TRANSAKSI PENJUALAN';
      titleCell2.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet2.getRow(1).height = 30;

      sheet2.mergeCells('A2:I2');
      const subTitleCell2 = sheet2.getCell('A2');
      subTitleCell2.value = `Periode: ${rangeLabel} | Total Data: ${filteredTransactions.length} Transaksi`;
      subTitleCell2.font = { name: 'Arial', size: 10, italic: true, color: { argb: '475569' } };
      subTitleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      subTitleCell2.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet2.getRow(2).height = 20;

      sheet2.getRow(3).height = 10;

      // Header Row (Row 4)
      const headers2 = ['No', 'No. Trx', 'No. Antrian', 'Kasir', 'Metode', 'Tipe', 'Jumlah (IDR)', 'Status', 'Waktu (WIB)'];
      const headerRow2 = sheet2.getRow(4);
      headerRow2.values = headers2;
      headerRow2.height = 24;

      headerRow2.eachCell((cell: ExcelJS.Cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: '475569' } },
          left: { style: 'thin', color: { argb: '475569' } },
          bottom: { style: 'medium', color: { argb: '0F172A' } },
          right: { style: 'thin', color: { argb: '475569' } },
        };
      });

      let txRowIdx = 5;
      filteredTransactions.forEach((t, index) => {
        const row = sheet2.getRow(txRowIdx);
        row.values = [
          index + 1,
          t.trx_number || 'PENDING',
          t.daily_queue_number ? `#${t.daily_queue_number}` : '-',
          cashierMap[t.cashier_id || ''] || 'Sistem / Tanpa Kasir',
          t.payment_method,
          t.order_type === 'dine_in' ? 'Dine In' : 'Takeaway',
          Number(t.amount),
          t.status,
          toWIB(t.created_at),
        ];
        row.height = 19;

        const isEven = index % 2 === 0;
        const bgPattern = isEven ? 'F8FAFC' : 'FFFFFF';

        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(7).numFmt = '"Rp "#,##0';
        row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };

        for (let col = 1; col <= 9; col++) {
          const cell = row.getCell(col);
          cell.font = { name: 'Arial', size: 9 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgPattern } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E2E8F0' } },
            left: { style: 'thin', color: { argb: 'E2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
            right: { style: 'thin', color: { argb: 'E2E8F0' } },
          };
        }

        txRowIdx++;
      });

      // Total Row for Sheet 2
      const totalRow2 = sheet2.getRow(txRowIdx);
      totalRow2.values = [
        'Total PAID',
        '',
        '',
        '',
        '',
        '',
        totalPaidAmount,
        `${totalPaidCount} Transaksi`,
        '',
      ];
      totalRow2.height = 24;
      sheet2.mergeCells(`A${txRowIdx}:F${txRowIdx}`);

      totalRow2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      totalRow2.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow2.getCell(7).numFmt = '"Rp "#,##0';
      totalRow2.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

      for (let col = 1; col <= 9; col++) {
        const cell = totalRow2.getCell(col);
        cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: '0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        cell.border = {
          top: { style: 'medium', color: { argb: '475569' } },
          bottom: { style: 'double', color: { argb: '475569' } },
          left: { style: 'thin', color: { argb: 'CBD5E1' } },
          right: { style: 'thin', color: { argb: 'CBD5E1' } },
        };
      }

      sheet2.columns = [
        { width: 8 },  // No
        { width: 22 }, // No. Trx
        { width: 12 }, // No. Antrian
        { width: 25 }, // Kasir
        { width: 12 }, // Metode
        { width: 14 }, // Tipe
        { width: 18 }, // Jumlah (IDR)
        { width: 14 }, // Status
        { width: 22 }, // Waktu (WIB)
      ];

      // Trigger Browser Download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `SeblakSS_POS_Laporan_${rangeLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export gagal: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Page Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            <div className="p-2 sm:p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            Laporan Keuangan
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Pantau performa omset dan riwayat penjualan</p>
        </div>

        {/* Filter Buttons & Export */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Mobile Filter Button Trigger */}
          <button
            onClick={() => setFilterModalOpen(true)}
            className="md:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-indigo-400 hover:bg-slate-800 transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter & Tanggal</span>
          </button>

          {/* Desktop Dropdown filter cashier */}
          <div className="hidden md:block relative">
            <select
              value={selectedCashierFilter}
              onChange={(e) => setSelectedCashierFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 text-xs font-semibold appearance-none pr-8 cursor-pointer"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3e%3cpath stroke=\'%2394a3b8\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3e%3c/svg%3e")',
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1.25em 1.25em',
                backgroundRepeat: 'no-repeat'
              }}
            >
              <option value="all">Semua Kasir</option>
              <option value="system">Sistem / Tanpa Kasir</option>
              {Object.entries(cashierMap).map(([id, email]) => (
                <option key={id} value={id}>{email}</option>
              ))}
            </select>
          </div>

          {/* Desktop Filter Pills */}
          <div className="hidden md:flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1 text-xs">
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
              onClick={() => setFilterRange('thisMonth')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterRange === 'thisMonth' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setFilterRange('30days')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                filterRange === '30days' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 Hari
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
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all duration-200 shadow-lg shadow-indigo-600/20"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">Ekspor Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>
        </div>
      </div>

      {/* Mobile Scrollable Quick Filter Bar & Active Badge */}
      <div className="md:hidden space-y-2 pt-1">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setFilterRange('today')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all border ${
              filterRange === 'today'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Hari Ini
          </button>
          <button
            onClick={() => setFilterRange('7days')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all border ${
              filterRange === '7days'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            7 Hari
          </button>
          <button
            onClick={() => setFilterRange('thisMonth')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all border ${
              filterRange === 'thisMonth'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Bulan Ini
          </button>
          <button
            onClick={() => setFilterRange('30days')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all border ${
              filterRange === '30days'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            30 Hari
          </button>
          <button
            onClick={() => setFilterRange('custom')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all border ${
              filterRange === 'custom'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Kustom
          </button>
          <button
            onClick={() => setFilterModalOpen(true)}
            className="px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap bg-slate-800 border border-slate-700 text-indigo-300 flex items-center gap-1 shrink-0"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Filter Lengkap</span>
          </button>
        </div>

        {/* Active Filter Status Badge */}
        <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-900/40 rounded-xl px-3 py-1.5 text-[10px] text-indigo-300 font-medium">
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            <span className="truncate">
              Filter: <strong className="text-white">
                {filterRange === 'today' ? 'Hari Ini' : filterRange === '7days' ? '7 Hari' : filterRange === 'thisMonth' ? 'Bulan Ini' : filterRange === '30days' ? '30 Hari' : 'Kustom'}
              </strong> • <strong className="text-white">{selectedCashierFilter === 'all' ? 'Semua Kasir' : cashierMap[selectedCashierFilter] || 'Tanpa Kasir'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Custom Date Range Picker Form */}
      {filterRange === 'custom' && (
        <div className="hidden md:flex backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 flex-wrap gap-4 items-end animate-fadeIn">
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

      {/* Mobile Bottom Sheet Modal for Filters */}
      {filterModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filter Laporan Keuangan</span>
              </div>
              <button
                onClick={() => setFilterModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Filter Akun Kasir
                </label>
                <select
                  value={selectedCashierFilter}
                  onChange={(e) => setSelectedCashierFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="all">Semua Kasir</option>
                  <option value="system">Sistem / Tanpa Kasir</option>
                  {Object.entries(cashierMap).map(([id, email]) => (
                    <option key={id} value={id}>{email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Rentang Waktu
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFilterRange('today')}
                    className={`py-2 px-3 rounded-xl font-semibold border transition-all text-center ${
                      filterRange === 'today' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Hari Ini
                  </button>
                  <button
                    onClick={() => setFilterRange('7days')}
                    className={`py-2 px-3 rounded-xl font-semibold border transition-all text-center ${
                      filterRange === '7days' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    7 Hari Terakhir
                  </button>
                  <button
                    onClick={() => setFilterRange('thisMonth')}
                    className={`py-2 px-3 rounded-xl font-semibold border transition-all text-center ${
                      filterRange === 'thisMonth' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Bulan Ini (Kalender)
                  </button>
                  <button
                    onClick={() => setFilterRange('30days')}
                    className={`py-2 px-3 rounded-xl font-semibold border transition-all text-center ${
                      filterRange === '30days' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    30 Hari Terakhir
                  </button>
                  <button
                    onClick={() => setFilterRange('custom')}
                    className={`col-span-2 py-2 px-3 rounded-xl font-semibold border transition-all text-center ${
                      filterRange === 'custom' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Kustom Tanggal
                  </button>
                </div>
              </div>

              {filterRange === 'custom' && (
                <div className="space-y-3 pt-2 border-t border-slate-800/60">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Tanggal Mulai</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Tanggal Akhir</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  fetchReportData();
                  setFilterModalOpen(false);
                }}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 text-xs transition-all mt-2"
              >
                Terapkan Filter & Lihat Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS SUMMARY CARDS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Omset */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Total Omset</span>
            <div className="p-1.5 sm:p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400"><TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{formatMoney(stats.total)}</h2>
          <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">Pada rentang terpilih</p>
        </div>

        {/* Total Transaksi */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Total Transaksi</span>
            <div className="p-1.5 sm:p-2.5 bg-amber-500/10 rounded-xl text-amber-400"><UsersIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{stats.count}</h2>
          <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1">Transaksi sukses</p>
        </div>

        {/* CASH */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Omset Cash</span>
            <div className="p-1.5 sm:p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400"><DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{formatMoney(stats.cash)}</h2>
          <p className="text-[9px] sm:text-[10px] text-emerald-400 mt-1">Pembayaran tunai</p>
        </div>

        {/* QRIS */}
        <div className="relative overflow-hidden backdrop-blur-md bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 sm:p-5 shadow-xl">
          <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-bl from-violet-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Omset QRIS</span>
            <div className="p-1.5 sm:p-2.5 bg-violet-500/10 rounded-xl text-violet-400"><QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></div>
          </div>
          <h2 className="text-base sm:text-2xl font-extrabold tracking-tight text-white">{formatMoney(stats.qris)}</h2>
          <p className="text-[9px] sm:text-[10px] text-violet-400 mt-1">Pembayaran digital</p>
        </div>
      </section>

      {/* REVENUE TREND CHART (SVG) */}
      <section className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-200">Tren Penjualan Harian</h3>
            <p className="text-[11px] sm:text-xs text-slate-400">Grafik omset harian dalam rentang waktu terpilih</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-medium md:hidden">
            <span>Geser grafik ke kanan</span>
            <ArrowRight className="w-3 h-3 animate-pulse" />
          </div>
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

      {/* CASHIER REVENUE BREAKDOWN */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-200">Pendapatan per Akun Kasir</h3>
            <p className="text-xs text-slate-400">Total penjualan sukses kasir pada rentang waktu terpilih</p>
          </div>
          <div className="divide-y divide-slate-800/60 max-h-[200px] overflow-y-auto pr-1">
            {Object.keys(stats.cashierRevenue).length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">Belum ada transaksi pada periode ini.</p>
            ) : (
              Object.entries(stats.cashierRevenue)
                .sort((a, b) => b[1] - a[1])
                .map(([cid, revenue]) => {
                  const email = cashierMap[cid] || (cid === 'system' ? 'Sistem / Tanpa Kasir' : 'Tidak Diketahui');
                  const percent = stats.total > 0 ? Math.round((revenue / stats.total) * 100) : 0;
                  return (
                    <div key={cid} className="py-3 flex items-center justify-between text-xs gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex justify-between text-slate-300 font-medium">
                          <span>{email}</span>
                          <span className="font-bold text-indigo-400">{percent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                      <div className="text-right font-bold text-slate-200 min-w-[90px]">
                        {formatMoney(revenue)}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Notes Card */}
        <div className="backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-200">Analisis Kasir</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Analisis ini menunjukkan kontribusi omset dari masing-masing akun kasir yang terdaftar. Data diperbarui secara dinamis mengikuti filter tanggal di atas. Gunakan filter kasir pada tombol di kanan atas untuk memfokuskan grafik tren dan detail transaksi pada satu kasir tertentu.
            </p>
          </div>
          <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 text-[11px] text-indigo-400 leading-normal">
            💡 **Tip Audit:** Untuk laporan penutupan shift, pilih filter kasir yang bersangkutan dan gunakan tombol **Ekspor Excel** untuk mengunduh laporan penjualan terperinci mereka.
          </div>
        </div>
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
                    <div className="bg-slate-950/10">
                      {/* Desktop Table View */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800/80">
                            <tr>
                              <th className="px-4 py-2.5">#</th>
                              <th className="px-4 py-2.5">No Trx</th>
                              <th className="px-4 py-2.5">Kasir</th>
                              <th className="px-4 py-2.5">Metode</th>
                              <th className="px-4 py-2.5">Jumlah</th>
                              <th className="px-4 py-2.5">Status</th>
                              <th className="px-4 py-2.5">Waktu (WIB)</th>
                              <th className="px-4 py-2.5 text-center">Aksi</th>
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
                                <td className="px-4 py-2.5 text-slate-300 font-medium truncate max-w-[120px]" title={cashierMap[t.cashier_id || ''] || 'Sistem / Tanpa Kasir'}>
                                  {cashierMap[t.cashier_id || ''] || 'Sistem / Tanpa Kasir'}
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
                                <td className="px-4 py-2.5 text-center">
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
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="block md:hidden p-3 space-y-3">
                        {group.transactions.map((t) => (
                          <div key={t.id} className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-indigo-400 font-bold">
                                {t.daily_queue_number ? `#${t.daily_queue_number}` : '-'}
                              </span>
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

                            <div className="flex justify-between items-start text-xs gap-4">
                              <div className="min-w-0">
                                <div className="font-bold text-slate-200 truncate">{t.trx_number || 'PENDING'}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5 font-medium truncate">
                                  Kasir: {cashierMap[t.cashier_id || ''] || 'Sistem'}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{toWIB(t.created_at)}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-bold text-slate-100">{formatMoney(Number(t.amount))}</div>
                                {t.additions && (
                                  <div className="text-[9px] text-slate-500 mt-0.5 font-mono">
                                    +{t.additions.split('+').map(x => Number(x).toLocaleString('id-ID')).join(' + ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60 text-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                  t.payment_method === 'QRIS'
                                    ? 'bg-violet-950/60 text-violet-300 border border-violet-900/60'
                                    : 'bg-emerald-950/60 text-emerald-300 border border-emerald-900/60'
                                }`}>
                                  {t.payment_method === 'QRIS' ? <QrCode className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                                  {t.payment_method}
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  t.order_type === 'dine_in'
                                    ? 'bg-blue-950/60 text-blue-300 border border-blue-900/60'
                                    : 'bg-orange-950/60 text-orange-300 border border-orange-900/60'
                                }`}>
                                  {t.order_type === 'dine_in' ? 'Dine In' : 'Takeaway'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleViewDetails(t)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 font-bold text-xs active:scale-95 transition-all"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Detail</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteTransaction(t.id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20 font-bold text-xs active:scale-95 transition-all"
                                  title="Hapus"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
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
