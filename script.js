// --- DATABASE STATE & CONFIG ---
// Isi URL Supabase dan Anon Key kamu di sini.
// Karena ini file frontend statis, nilai ini akan terlihat oleh browser/GitHub Pages.
// Supabase anon key memang boleh dipakai di frontend, asalkan RLS/policy database sudah kamu atur dengan benar.
const SUPABASE_URL = 'https://ppcpkgycxqvvzelxeaxc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vjAxDgEB0K4PWEuHQD6oQw_vY3eaY-I';

let supabaseUrl = localStorage.getItem('supabase_url') || SUPABASE_URL || '';
let supabaseAnonKey = localStorage.getItem('supabase_anon_key') || SUPABASE_ANON_KEY || '';
let supabaseClient = null;

// Nama kolom tambahan di tabel Supabase `vehicles`.
// Gunakan type_armada, bukan type-armada, agar aman untuk PostgreSQL/Supabase.
const EXTRA_FIELDS = {
  noHandphone: 'noHandphone',
  typeArmada: 'type_armada',
  notes: 'notes'
};

// Initialize Supabase Client if possible
function initSupabase() {
  const createClient = window.supabase?.createClient;
  if (!createClient) {
    console.warn('Supabase JS SDK is not loaded from CDN yet.');
    supabaseClient = null;
    return;
  }
  
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const urlPattern = /^https?:\/\/[a-z0-9.-]+(|:\d+)(\/.*)?$/i;
      if (urlPattern.test(supabaseUrl) && !supabaseUrl.includes('PLACEHOLDER') && !supabaseUrl.includes('MY_SUPABASE')) {
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: true }
        });
        console.log('Supabase client initialized successfully.');
        return;
      }
    } catch (e) {
      console.error('Error initializing Supabase client:', e);
    }
  }
  supabaseClient = null;
}

initSupabase();

// --- OPERATIONAL CONFIG PANEL STATE ---
let showDeveloperPanel = false;
let currentTab = 'monitoring'; // 'monitoring' or 'history'
let statusFilter = 'all'; // 'all', 'Pending', 'Proses', 'Selesai'
let searchQuery = '';
let vehicles = [];

// Database is required for all read/write operations. No offline sample storage is used.

// --- UTILITY: TIME CALCULATOR & DURATION ---
function calculateDuration(timeInStr, timeOutStr) {
  const timeIn = new Date(timeInStr);
  const timeOut = new Date(timeOutStr);
  const diffMs = timeOut.getTime() - timeIn.getTime();
  
  if (isNaN(diffMs) || diffMs <= 0) {
    return "0 Detik";
  }

  const totalDetik = Math.floor(diffMs / 1000);
  const hari = Math.floor(totalDetik / 86400);
  const sisaDetikSetelahHari = totalDetik % 86400;
  
  const jam = Math.floor(sisaDetikSetelahHari / 3600);
  const sisaDetikSetelahJam = sisaDetikSetelahHari % 3600;
  
  const menit = Math.floor(sisaDetikSetelahJam / 60);
  const detik = sisaDetikSetelahJam % 60;

  const parts = [];
  if (hari > 0) parts.push(`${hari} Hari`);
  if (jam > 0) parts.push(`${jam} Jam`);
  if (menit > 0) parts.push(`${menit} Menit`);
  if (detik > 0 || parts.length === 0) parts.push(`${detik} Detik`);

  return parts.join(" ");
}

function getExtraField(vehicle, fieldKey) {
  const columnName = EXTRA_FIELDS[fieldKey];
  if (!vehicle || !columnName) return '';

  // Fallback `type-armada` disediakan agar data lama/kolom lama tetap bisa tampil,
  // namun insert baru memakai `type_armada`.
  if (fieldKey === 'typeArmada') {
    return vehicle[columnName] || vehicle.typeArmada || vehicle['type-armada'] || '';
  }

  return vehicle[columnName] || '';
}

// --- CSV EXPORTER ---
function exportToCSV(dataToExport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const filename = `Laporan_Logistik_Gudang_${timestamp}.csv`;
  
  const headers = [
    'ID',
    'Nomor Kendaraan',
    'Nama Supir',
    'No Handphone',
    'Type Armada',
    'Notes',
    'Nomor Surat Jalan',
    'ID Row / Lokasi',
    'Tanggal',
    'Waktu Masuk (Time In)',
    'Waktu Keluar (Time Out)',
    'Status Bongkar Muat',
    'Durasi Operasional'
  ];

  const rows = dataToExport.map(v => [
    v.id,
    v.nomor_kendaraan,
    v.nama_supir,
    getExtraField(v, 'noHandphone'),
    getExtraField(v, 'typeArmada'),
    getExtraField(v, 'notes'),
    v.nomor_surat_jalan,
    v.id_row,
    v.tanggal,
    v.time_in ? new Date(v.time_in).toLocaleString('id-ID') : '',
    v.time_out ? new Date(v.time_out).toLocaleString('id-ID') : '',
    v.status_bongkar_muat,
    v.durasi || '-'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- CORE DATA OPERATIONS (SERVICE) ---
const vehicleService = {
  isDatabaseConnected() {
    return supabaseClient !== null;
  },

  ensureConnected() {
    if (!this.isDatabaseConnected()) {
      throw new Error('Database belum terhubung. Hubungkan Supabase sebelum menggunakan fitur input atau aksi data.');
    }
  },

  async fetchVehicles() {
    if (!this.isDatabaseConnected()) {
      return [];
    }

    const { data, error } = await supabaseClient
      .from('vehicles')
      .select('*')
      .order('time_in', { ascending: false });

    if (error) {
      console.error('Failed to load from Supabase:', error);
      throw error;
    }
    return data || [];
  },

  async addVehicle(vehicleData) {
    this.ensureConnected();

    const defaultData = {
      tanggal: new Date().toISOString().split('T')[0],
      time_in: new Date().toISOString(),
      time_out: null,
      status_bongkar_muat: 'Pending',
      durasi: null
    };

    const newRecord = { ...vehicleData, ...defaultData };

    const { data, error } = await supabaseClient
      .from('vehicles')
      .insert([newRecord])
      .select();

    if (error) throw error;
    return data[0];
  },

  async updateStatus(id, status) {
    this.ensureConnected();

    const { error } = await supabaseClient
      .from('vehicles')
      .update({ status_bongkar_muat: status })
      .eq('id', id);

    if (error) throw error;
  },

  async setVehicleTimeOut(id) {
    this.ensureConnected();

    const timeOut = new Date().toISOString();

    const { data: fetchResult, error: fetchErr } = await supabaseClient
      .from('vehicles')
      .select('time_in')
      .eq('id', id)
      .single();

    if (fetchErr) throw fetchErr;

    const calculatedDurasi = calculateDuration(fetchResult.time_in, timeOut);

    const { error } = await supabaseClient
      .from('vehicles')
      .update({
        time_out: timeOut,
        status_bongkar_muat: 'Selesai',
        durasi: calculatedDurasi
      })
      .eq('id', id);

    if (error) throw error;
  },

  async deleteVehicle(id) {
    this.ensureConnected();

    const { error } = await supabaseClient
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  activeSubscription: null,

  subscribe(callback) {
    this.onUpdateCallback = callback;
    if (!this.isDatabaseConnected()) return;

    if (this.activeSubscription) {
      supabaseClient.removeChannel(this.activeSubscription);
    }

    this.activeSubscription = supabaseClient
      .channel('vehicles_all_changes_vanilla')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles' },
        (payload) => {
          console.log('Realtime broadcast from Supabase:', payload);
          callback();
        }
      )
      .subscribe();
  },

  triggerUpdate() {
    if (this.onUpdateCallback) {
      this.onUpdateCallback();
    }
  }
};

// --- CORE UI RENDER TRIGGERS ---
async function refreshData() {
  try {
    vehicles = await vehicleService.fetchVehicles();
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    vehicles = [];
  }
  renderAll();
}

// Subscribe changes initially
vehicleService.subscribe(() => {
  refreshData();
});

// --- DIGITAL REAL-TIME CLOCK IN HEADER ---
function updateClock() {
  const clockEl = document.getElementById('digital-clock');
  if (clockEl) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
    clockEl.innerHTML = `
      <svg class="w-3.5 h-3.5 text-indigo-400 animate-pulse" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      <span>${timeStr} WIB</span>
      <span class="text-slate-600">|</span>
      <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">${dateStr}</span>
    `;
  }
}
setInterval(updateClock, 1000);
updateClock();

// --- RENDERING VIEWS ---
function renderAll() {
  renderHeaderStatus();
  renderStats();
  renderTable();
  renderInputAvailability();
}

function renderHeaderStatus() {
  const container = document.getElementById('system-status-header');
  if (!container) return;

  const isConnected = vehicleService.isDatabaseConnected();
  if (!isConnected) {
    container.innerHTML = `
      <span class="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">System Status</span>
      <div class="text-xs font-mono text-red-400 flex items-center gap-1.5 transition-all uppercase">
        <span class="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></span>
        DB_NOT_CONNECTED
      </div>
    `;
  } else {
    container.innerHTML = `
      <span class="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">System Status</span>
      <div class="text-xs font-mono text-emerald-400 flex items-center gap-1.5 transition-all uppercase">
        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
        SUPABASE_CONNECTED
      </div>
    `;
  }
}

function renderStats() {
  let totalAktif = 0;
  let totalProses = 0;
  let totalKeluar = 0;

  vehicles.forEach(v => {
    if (v.time_out === null) {
      totalAktif++;
      if (v.status_bongkar_muat === 'Proses') {
        totalProses++;
      }
    } else {
      totalKeluar++;
    }
  });

  const activeCountEl = document.getElementById('stat-active-count');
  const processCountEl = document.getElementById('stat-process-count');
  const clearedCountEl = document.getElementById('stat-cleared-count');

  if (activeCountEl) activeCountEl.innerText = String(totalAktif).padStart(2, '0');
  if (processCountEl) processCountEl.innerText = String(totalProses).padStart(2, '0');
  if (clearedCountEl) clearedCountEl.innerText = String(totalKeluar).padStart(2, '0');
}

function renderTable() {
  const tableBody = document.getElementById('vehicles-table-body');
  if (!tableBody) return;

  // Filter vehicles
  const filtered = vehicles.filter(v => {
    // 1. Tab filter
    if (currentTab === 'monitoring' && v.time_out !== null) return false;
    if (currentTab === 'history' && v.time_out === null) return false;

    // 2. Status filter (only applied on monitoring active tab)
    if (currentTab === 'monitoring' && statusFilter !== 'all') {
      if (v.status_bongkar_muat !== statusFilter) return false;
    }

    // 3. Search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const nopol = (v.nomor_kendaraan || '').toLowerCase();
      const supir = (v.nama_supir || '').toLowerCase();
      const sj = (v.nomor_surat_jalan || '').toLowerCase();
      const row = (v.id_row || '').toLowerCase();
      const hp = getExtraField(v, 'noHandphone').toLowerCase();
      const armada = getExtraField(v, 'typeArmada').toLowerCase();
      const notes = getExtraField(v, 'notes').toLowerCase();
      if (!nopol.includes(q) && !supir.includes(q) && !sj.includes(q) && !row.includes(q) && !hp.includes(q) && !armada.includes(q) && !notes.includes(q)) {
        return false;
      }
    }

    return true;
  });

  // Render tab stats counters
  const activeCountTab = document.getElementById('tab-counter-active');
  const historyCountTab = document.getElementById('tab-counter-history');
  
  if (activeCountTab) {
    activeCountTab.innerText = vehicles.filter(v => v.time_out === null).length;
  }
  if (historyCountTab) {
    historyCountTab.innerText = vehicles.filter(v => v.time_out !== null).length;
  }

  // Build rows or empty state
  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="py-12 text-center text-slate-400">
          <svg class="w-8 h-8 text-slate-300 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8"></path><path d="M14 11h7v5a2 2 0 0 1-2 2h-1"></path><path d="M14 11V4a2 2 0 0 1 2-2h3t2 2v7"></path><circle cx="7.5" cy="18.5" r="2.5"></circle><circle cx="17.5" cy="18.5" r="2.5"></circle></svg>
          <p class="text-xs font-semibold">Tidak Ada Hasil Logistik</p>
          <p class="text-[10px] text-slate-350">Data kosong atau saringan pencarian Anda tidak menemukan kecocokan.</p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(v => {
    // Style variables for status badge
    let badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/50';
    let statusText = 'Pending';
    if (v.status_bongkar_muat === 'Proses') {
      badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200/50';
      statusText = 'Proses';
    } else if (v.status_bongkar_muat === 'Selesai') {
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/50';
      statusText = 'Selesai';
    }

    const timeInFormated = v.time_in ? new Date(v.time_in).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
    const timeOutFormated = v.time_out ? new Date(v.time_out).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
    const noHandphone = getExtraField(v, 'noHandphone') || '-';
    const typeArmada = getExtraField(v, 'typeArmada') || '-';
    const notes = getExtraField(v, 'notes') || '-';

    const renderActionButtons = () => {
      if (!vehicleService.isDatabaseConnected()) {
        return `<span class="inline-flex items-center px-2.5 py-1 text-[10px] bg-slate-100 text-slate-400 border border-slate-200 rounded uppercase font-bold cursor-not-allowed">DB Offline</span>`;
      }

      if (currentTab === 'monitoring') {
        const isSelectedProses = v.status_bongkar_muat === 'Proses';
        const isSelectedDone = v.status_bongkar_muat === 'Selesai';

        return `
          <div class="flex items-center gap-1">
            <div class="flex items-center bg-slate-100 border border-slate-200 p-0.5 rounded-lg mr-2">
              <button data-action="status" data-id="${v.id}" data-status="Proses" class="px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-all cursor-pointer ${isSelectedProses ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-650 hover:bg-white'}">
                Service
              </button>
              <button data-action="status" data-id="${v.id}" data-status="Selesai" class="px-2.5 py-1 text-[10px] uppercase font-bold rounded transition-all cursor-pointer ${isSelectedDone ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-700 hover:bg-white'}">
                Done
              </button>
            </div>
            <button data-action="timeout" data-id="${v.id}" class="px-2.5 py-1 text-[10px] bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-600 hover:text-white transition-all uppercase font-bold cursor-pointer">
              Clear Out
            </button>
            <button data-action="delete" data-id="${v.id}" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer shrink-0">
              <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
            </button>
          </div>
        `;
      } else {
        return `
          <button data-action="delete" data-id="${v.id}" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer">
            <svg class="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>
          </button>
        `;
      }
    };

    return `
      <tr class="hover:bg-slate-50/75 transition-colors border-b border-slate-100 last:border-none">
        <td class="py-4 px-6">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 font-mono text-[10px] font-bold">
              ${v.nomor_kendaraan ? v.nomor_kendaraan.slice(0, 2) : 'B'}
            </div>
            <div>
              <p class="font-mono text-sm font-bold text-slate-800 tracking-wider">${v.nomor_kendaraan}</p>
              <p class="text-[11px] text-slate-450 mt-0.5 font-medium">${v.nama_supir}</p>
            </div>
          </div>
        </td>

        <td class="py-4 px-4">
          <div class="space-y-1">
            <p class="text-[11px] text-slate-600 font-mono font-semibold">${noHandphone}</p>
            <span class="inline-block px-1.5 py-0.5 bg-indigo-50 text-[10px] font-bold text-indigo-700 rounded">
              ${typeArmada}
            </span>
            <p class="text-[10px] text-slate-400 max-w-[180px] whitespace-normal break-words">${notes}</p>
          </div>
        </td>
        
        <td class="py-4 px-4">
          <div class="font-mono">
            <p class="text-[11px] text-slate-500 font-medium">${v.nomor_surat_jalan}</p>
            <span class="inline-block mt-1 px-1.5 py-0.5 bg-slate-150 text-[10px] font-bold text-slate-600 rounded">
              ${v.id_row}
            </span>
          </div>
        </td>

        <td class="py-4 px-4 text-center font-mono">
          <p class="text-slate-600 text-xs font-semibold">${timeInFormated}</p>
          <span class="text-[9px] text-slate-400">Time Inside</span>
        </td>

        <td class="py-4 px-4 text-center font-mono">
          <p class="text-slate-600 text-xs font-semibold">${timeOutFormated}</p>
          <span class="text-[9px] text-slate-400">Gate-Out</span>
        </td>

        <td class="py-4 px-4 text-center">
          <span class="inline-flex items-center gap-1 px-2.5 py-0.5 border rounded-full text-[10px] font-bold tracking-wider uppercase ${badgeClass}">
            <span class="w-1 h-1 rounded-full bg-current"></span>
            ${statusText}
          </span>
        </td>

        <td class="py-4 px-4 text-center font-mono">
          <span class="inline-block px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-650 font-bold">
            ${v.durasi ? v.durasi : (v.time_out ? '-' : 'Active Recording')}
          </span>
        </td>

        <td class="py-4 px-6 text-right">
          ${renderActionButtons()}
        </td>
      </tr>
    `;
  }).join('');

  // Attach button event listeners inside table
  tableBody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      
      if (!vehicleService.isDatabaseConnected()) {
        alert('Database belum terhubung. Aksi data dikunci.');
        return;
      }

      try {
        if (action === 'status') {
        const nextStatus = btn.getAttribute('data-status');
        await vehicleService.updateStatus(id, nextStatus);
        refreshData();
      } else if (action === 'timeout') {
        await vehicleService.setVehicleTimeOut(id);
        refreshData();
      } else if (action === 'delete') {
          if (confirm('Konfirmasi hapus log aktivitas kendaraan ini?')) {
            await vehicleService.deleteVehicle(id);
            refreshData();
          }
        }
      } catch (err) {
        console.error(err);
        alert('Aksi gagal. Pastikan database Supabase sudah terhubung dan tabel vehicles tersedia.');
      }
    });
  });
}

function renderInputAvailability() {
  const isConnected = vehicleService.isDatabaseConnected();
  const form = document.getElementById('vehicle-checkin-form');
  if (!form) return;

  form.querySelectorAll('input, button[type="submit"]').forEach((el) => {
    el.disabled = !isConnected;
    el.classList.toggle('cursor-not-allowed', !isConnected);
    el.classList.toggle('opacity-60', !isConnected);
  });

  let notice = document.getElementById('db-required-alert');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'db-required-alert';
    notice.className = 'mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium';
    notice.innerHTML = '<span class="font-semibold">Database belum terhubung.</span><span>Input kendaraan dan aksi data dikunci sampai koneksi Supabase aktif.</span>';
    form.parentNode.insertBefore(notice, form);
  }
  notice.style.display = isConnected ? 'none' : 'flex';
}

// --- INTERACTIVE BINDINGS ON START ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Checking Check-In Form Submit
  const checkinForm = document.getElementById('vehicle-checkin-form');
  if (checkinForm) {
    checkinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const noKendaraanInput = document.getElementById('no-kendaraan-input');
      const namaSupirInput = document.getElementById('nama-supir-input');
      const noHandphoneInput = document.getElementById('no-handphone-input');
      const typeArmadaInput = document.getElementById('type-armada-input');
      const notesInput = document.getElementById('notes-input');
      const noSuratJalanInput = document.getElementById('no-surat-jalan-input');
      const idRowInput = document.getElementById('id-row-input');

      if (!vehicleService.isDatabaseConnected()) {
        alert('Database belum terhubung. Input kendaraan dikunci sampai koneksi Supabase aktif.');
        return;
      }

      const data = {
        nomor_kendaraan: noKendaraanInput.value.trim(),
        nama_supir: namaSupirInput.value.trim(),
        [EXTRA_FIELDS.noHandphone]: noHandphoneInput.value.trim(),
        [EXTRA_FIELDS.typeArmada]: typeArmadaInput.value.trim(),
        [EXTRA_FIELDS.notes]: notesInput.value.trim(),
        nomor_surat_jalan: noSuratJalanInput.value.trim(),
        id_row: idRowInput.value.trim() || 'ROW-A1'
      };

      if (!data.nomor_kendaraan || !data.nama_supir || !data[EXTRA_FIELDS.noHandphone] || !data[EXTRA_FIELDS.typeArmada] || !data.nomor_surat_jalan) {
        alert('Harap lengkapi semua kolom form registrasi!');
        return;
      }

      const submitBtn = checkinForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        Mendaftarkan...
      `;

      try {
        await vehicleService.addVehicle(data);
        
        // Reset form fields
        noKendaraanInput.value = '';
        namaSupirInput.value = '';
        noHandphoneInput.value = '';
        typeArmadaInput.value = '';
        notesInput.value = '';
        noSuratJalanInput.value = '';
        idRowInput.value = '';

        // Show Success toast
        const sAlert = document.getElementById('checkin-success-alert');
        if (sAlert) {
          sAlert.style.display = 'flex';
          setTimeout(() => {
            sAlert.style.display = 'none';
          }, 4500);
        }

        refreshData();
      } catch (err) {
        console.error(err);
        alert('Gagal mendata kendaraan masuk!');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // 2. Tabs Trigger
  const tabMonitoring = document.getElementById('tab-btn-monitoring');
  const tabHistory = document.getElementById('tab-btn-history');
  const queryStatusWrapper = document.getElementById('operational-status-select-wrapper');

  if (tabMonitoring && tabHistory) {
    tabMonitoring.addEventListener('click', () => {
      currentTab = 'monitoring';
      tabMonitoring.className = `px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer bg-white text-indigo-700 shadow-sm border border-slate-200`;
      tabHistory.className = `px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer text-slate-500 hover:text-slate-800`;
      // Show filter
      if (queryStatusWrapper) queryStatusWrapper.style.display = 'flex';
      refreshData();
    });

    tabHistory.addEventListener('click', () => {
      currentTab = 'history';
      tabHistory.className = `px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer bg-white text-indigo-700 shadow-sm border border-slate-200`;
      tabMonitoring.className = `px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer text-slate-500 hover:text-slate-800`;
      // Hide filter status (history doesn't have status changes since all are Cleared/Selesai)
      if (queryStatusWrapper) queryStatusWrapper.style.display = 'none';
      refreshData();
    });
  }

  // 3. Searching Inputs
  const searchInp = document.getElementById('vehicles-search-input');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderTable();
    });
  }

  // 4. Status filters
  const statFilterMng = document.getElementById('status-filter-select');
  if (statFilterMng) {
    statFilterMng.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      renderTable();
    });
  }

  // 5. CSV Exports Trigger Button
  const exportBtn = document.getElementById('vehicles-export-csv-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportToCSV(vehicles);
    });
  }


  // Load first data
  refreshData();
});
