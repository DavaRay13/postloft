'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Save,
  Upload,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Image as ImageIcon,
  Receipt,
  Store,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';

interface StoreSettings {
  id: string;
  store_name: string;
  store_address: string;
  store_phone: string;
  header_message: string;
  footer_message: string;
  separator_char: string;
  logo_url: string;
  owner_pin?: string;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const [settings, setSettings] = useState<StoreSettings>({
    id: '',
    store_name: 'Nama Toko Anda',
    store_address: '',
    store_phone: '',
    header_message: '',
    footer_message: 'Terima Kasih!',
    separator_char: '=',
    logo_url: '',
    owner_pin: '1234',
  });

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('store_settings')
          .select('*')
          .limit(1)
          .single();

        if (error) throw error;
        if (data) setSettings(data as StoreSettings);
      } catch (e) {
        console.error('Failed to load settings:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (settings.owner_pin && settings.owner_pin.length < 4) {
      setError('PIN Owner minimal harus 4 digit angka (maksimal 6 digit)');
      setSaving(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('store_settings')
        .update({
          store_name: settings.store_name,
          store_address: settings.store_address,
          store_phone: settings.store_phone,
          header_message: settings.header_message,
          footer_message: settings.footer_message,
          separator_char: settings.separator_char,
          logo_url: settings.logo_url,
          owner_pin: settings.owner_pin || '1234',
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) throw error;
      setSuccess('Pengaturan berhasil disimpan! PIN Owner dan konfigurasi struk akan otomatis tersinkronisasi ke aplikasi kasir mobile.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  // Upload logo
  const handleLogoUpload = async (file: File) => {
    if (file.size > 500 * 1024) {
      setError('Ukuran file maksimal 500KB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (PNG, JPG)');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExt}`;

      // Delete old logo if exists
      if (settings.logo_url) {
        const oldPath = settings.logo_url.split('/store-logos/')[1];
        if (oldPath) {
          await supabase.storage.from('store-logos').remove([oldPath]);
        }
      }

      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from('store-logos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('store-logos')
        .getPublicUrl(fileName);

      const logoUrl = urlData.publicUrl;

      // Update settings with new logo URL
      setSettings((prev) => ({ ...prev, logo_url: logoUrl }));

      // Immediately save to DB
      await supabase
        .from('store_settings')
        .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
        .eq('id', settings.id);

      setSuccess('Logo berhasil di-upload!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteLogo = async () => {
    setError(null);
    try {
      if (settings.logo_url) {
        const oldPath = settings.logo_url.split('/store-logos/')[1];
        if (oldPath) {
          await supabase.storage.from('store-logos').remove([oldPath]);
        }
      }

      await supabase
        .from('store_settings')
        .update({ logo_url: '', updated_at: new Date().toISOString() })
        .eq('id', settings.id);

      setSettings((prev) => ({ ...prev, logo_url: '' }));
      setSuccess('Logo dihapus.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus logo');
    }
  };

  const [activeMobileTab, setActiveMobileTab] = useState<'form' | 'preview'>('form');

  // Generate receipt preview separator
  const getSeparator = (char: string) => (char || '=').repeat(32);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
        <span className="text-sm text-slate-400">Memuat pengaturan...</span>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/10 rounded-xl text-indigo-400">
              <Receipt className="w-4 h-4" />
            </div>
            Pengaturan Struk & PIN
          </h2>
          <p className="text-[10px] text-slate-400">Desain struk & PIN Owner kasir</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20 active:scale-95"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saving ? 'Simpan...' : 'Simpan'}</span>
        </button>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1 text-xs">
        <button
          onClick={() => setActiveMobileTab('form')}
          className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
            activeMobileTab === 'form' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Form Pengaturan
        </button>
        <button
          onClick={() => setActiveMobileTab('preview')}
          className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
            activeMobileTab === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Preview Struk
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="truncate">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-950/40 border border-green-800/50 text-green-400 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="truncate">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="space-y-3">
        {/* Settings Form */}
        <div className={`${activeMobileTab === 'form' ? 'block' : 'hidden'} backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3.5 shadow-xl space-y-4`}>
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-2">
            <Store className="w-4 h-4 text-indigo-400" />
            Informasi Toko
          </h3>

          {/* Logo Upload */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Logo Toko</label>
            <div className="flex items-center gap-4">
              {settings.logo_url ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-700 bg-white flex items-center justify-center">
                  <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-slate-600" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                >
                  {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? 'Uploading...' : 'Upload Logo'}
                </button>
                {settings.logo_url && (
                  <button
                    onClick={handleDeleteLogo}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-950/20 border border-red-900/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Logo
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-2">PNG atau JPG, maksimal 500KB. Disarankan hitam-putih untuk hasil cetak terbaik.</p>
          </div>

          {/* Store Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Nama Toko</label>
            <input
              type="text"
              value={settings.store_name}
              onChange={(e) => setSettings((p) => ({ ...p, store_name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              placeholder="Nama Toko Anda"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Alamat Toko</label>
            <input
              type="text"
              value={settings.store_address}
              onChange={(e) => setSettings((p) => ({ ...p, store_address: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              placeholder="Jl. Contoh No. 123"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Telepon</label>
            <input
              type="text"
              value={settings.store_phone}
              onChange={(e) => setSettings((p) => ({ ...p, store_phone: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              placeholder="08xx-xxxx-xxxx"
            />
          </div>

          {/* Header Message */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Pesan Header</label>
            <input
              type="text"
              value={settings.header_message}
              onChange={(e) => setSettings((p) => ({ ...p, header_message: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              placeholder="Slogan atau pesan di atas struk"
            />
          </div>

          {/* Footer Message */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Pesan Footer</label>
            <input
              type="text"
              value={settings.footer_message}
              onChange={(e) => setSettings((p) => ({ ...p, footer_message: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
              placeholder="Terima Kasih!"
            />
          </div>

          {/* Separator Char */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Karakter Pemisah</label>
            <div className="flex gap-3">
              {['=', '-', '*', '.'].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSettings((p) => ({ ...p, separator_char: ch }))}
                  className={`w-12 h-12 rounded-xl text-lg font-mono font-bold border transition-all ${
                    settings.separator_char === ch
                      ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Keamanan & PIN Owner Kasir */}
          <div className="pt-5 border-t border-slate-800/80 space-y-3">
            <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Keamanan & PIN Owner Kasir
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              PIN ini digunakan khusus oleh Owner untuk membuka menu <b className="text-slate-200">Riwayat Transaksi</b> dan melihat ringkasan omset penjualan harian pada aplikasi mobile kasir.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                PIN Owner (4–6 Digit)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={settings.owner_pin || ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setSettings((p) => ({ ...p, owner_pin: val }));
                  }}
                  className="w-full pl-10 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-mono tracking-widest"
                  placeholder="1234"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                  title={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                PIN default awal: <span className="text-indigo-300 font-mono font-semibold">1234</span>. Hanya angka minimal 4 digit dan maksimal 6 digit.
              </p>
            </div>
          </div>
        </div>

        {/* Live Receipt Preview */}
        <div className={`${activeMobileTab === 'preview' ? 'block' : 'hidden'} backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 shadow-xl`}>
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-indigo-400" />
            Preview Struk
          </h3>

          <div className="bg-white rounded-xl p-6 font-mono text-xs leading-relaxed text-black max-w-[320px] mx-auto shadow-inner">
            {/* Logo preview */}
            {settings.logo_url && (
              <div className="flex justify-center mb-2">
                <img src={settings.logo_url} alt="Logo" className="h-12 object-contain" />
              </div>
            )}

            <div className="text-center font-bold text-sm">{settings.store_name || 'Nama Toko'}</div>

            {settings.store_address && (
              <div className="text-center text-[10px] text-gray-600">{settings.store_address}</div>
            )}

            {settings.store_phone && (
              <div className="text-center text-[10px] text-gray-600">{settings.store_phone}</div>
            )}

            {settings.header_message && (
              <div className="text-center text-[10px] text-gray-500 mt-1">{settings.header_message}</div>
            )}

            <div className="text-center text-gray-400 mt-1">{getSeparator(settings.separator_char)}</div>

            <div className="text-center font-bold text-lg my-2">Pelanggan #5</div>

            <div className="text-[10px] text-gray-600">Trx: TRX-20260607-005</div>
            <div className="text-[10px] text-gray-600">Tgl: 07/06/2026 14:30 WIB</div>

            <div className="text-center text-gray-400 mt-1">{getSeparator(settings.separator_char)}</div>

            <div className="flex justify-between font-bold mt-1">
              <span>TOTAL</span>
              <span>45.000</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Bayar</span>
              <span>CASH</span>
            </div>

            <div className="text-center text-gray-400 mt-1">{getSeparator(settings.separator_char)}</div>

            {settings.footer_message && (
              <div className="text-center text-[10px] text-gray-500 mt-1">{settings.footer_message}</div>
            )}
          </div>

          <p className="text-[10px] text-slate-500 text-center mt-4">
            Preview untuk printer thermal 58mm (32 karakter per baris)
          </p>
        </div>
      </div>
    </div>
  );
}
