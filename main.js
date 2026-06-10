import './index.css';
import { createClient } from '@supabase/supabase-js';

// --- DATABASE STATE & CONFIG ---
let supabaseUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
let supabaseAnonKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
let supabaseClient = null;

// Initialize Supabase Client if possible
function initSupabase() {
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

const MOCK_KEY = 'warehouse_vehicles_mock_data';

// Menyiapkan data awal berkualitas tinggi agar aplikasi langsung terisi visual dashboard yang impresif
const getInitialMockData = () => {
  return [
    {
      id: 101,
      nomor_kendaraan: 'B 9184 TQA',
      nama_supir: 'Asep Sunandar',
      nomor_surat_jalan: 'SJ-A91-2309',
      id_row: 'ROW-A5',
      tanggal: new Date().toISOString().split('T')[0],
      time_in: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
      time_out: null,
      status_bongkar_muat: 'Proses',
      durasi: null
    },
    {
      id: 102,
      nomor_kendaraan: 'D 1455 VBC',
      nama_supir: 'Budi Santoso',
      nomor_surat_jalan: 'SJ-B12-9921',
      id_row: 'ROW-C12',
      tanggal: new Date().toISOString().split('T')[0],
      time_in: new Date(Date.now() - 1.2 * 60 * 60 * 1000).toISOString(),
      time_out: null,
      status_bongkar_muat: 'Pending',
      durasi: null
    },
    {
      id: 103,
      nomor_kendaraan: 'F 8291 KX',
      nama_supir: 'Cecep Rahman',
      nomor_surat_jalan: 'SJ-C01-8172',
      id_row: 'ROW-B8',
      tanggal: new Date().toISOString().split('T')[0],
      time_in: new Date(Date.now() - 6.5 * 60 * 60 * 1000).toISOString(),
      time_out: new Date(Date.now() - 4.2 * 60 * 60 * 1000).toISOString(),
      status_bongkar_muat: 'Selesai',
      durasi: '2 Jam 18 Menit'
    },
    {
      id: 104,
      nomor_kendaraan: 'L 3021 PL',
      nama_supir: 'Dedi Kurniawan',
      nomor_surat_jalan: 'SJ-D04-1011',
      id_row: 'ROW-A2',
      tanggal: new Date().toISOString().split('T')[0],
      time_in: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      time_out: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      status_bongkar_muat: 'Selesai',
      durasi: '1 Jam 45 Menit'
    }
  ];
};

// Seed LocalStorage if not present
if (!localStorage.getItem(MOCK_KEY)) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(getInitialMockData()));
}

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

// --- CSV EXPORTER ---
function exportToCSV(dataToExport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const filename = `Laporan_Logistik_Gudang_${timestamp}.csv`;
  
  const headers = [
    'ID',
    'Nomor Kendaraan',
    'Nama Supir',
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
  isMockMode() {
    return supabaseClient === null;
  },

  async fetchVehicles() {
    if (this.isMockMode()) {
      const raw = localStorage.getItem(MOCK_KEY);
      return raw ? JSON.parse(raw) : [];
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
    const defaultData = {
      tanggal: new Date().toISOString().split('T')[0],
      time_in: new Date().toISOString(),
      time_out: null,
      status_bongkar_muat: 'Pending',
      durasi: null
    };

    const newRecordTemp = { ...vehicleData, ...defaultData };

    if (this.isMockMode()) {
      const raw = localStorage.getItem(MOCK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const newId = list.length > 0 ? Math.max(...list.map(v => Number(v.id))) + 1 : 101;
      const newRecord = { id: newId, ...newRecordTemp };
      list.unshift(newRecord);
      localStorage.setItem(MOCK_KEY, JSON.stringify(list));
      this.triggerUpdate();
      return newRecord;
    }

    const { data, error } = await supabaseClient
      .from('vehicles')
      .insert([newRecordTemp])
      .select();

    if (error) throw error;
    return data[0];
  },

  async updateStatus(id, status) {
    if (this.isMockMode()) {
      const raw = localStorage.getItem(MOCK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const index = list.findIndex(v => String(v.id) === String(id));
      if (index !== -1) {
        list[index].status_bongkar_muat = status;
        localStorage.setItem(MOCK_KEY, JSON.stringify(list));
        this.triggerUpdate();
      }
      return;
    }

    const { error } = await supabaseClient
      .from('vehicles')
      .update({ status_bongkar_muat: status })
      .eq('id', id);

    if (error) throw error;
  },

  async setVehicleTimeOut(id) {
    const timeOut = new Date().toISOString();

    if (this.isMockMode()) {
      const raw = localStorage.getItem(MOCK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const index = list.findIndex(v => String(v.id) === String(id));
      if (index !== -1) {
        const item = list[index];
        item.time_out = timeOut;
        item.status_bongkar_muat = 'Selesai';
        item.durasi = calculateDuration(item.time_in, timeOut);
        localStorage.setItem(MOCK_KEY, JSON.stringify(list));
        this.triggerUpdate();
      }
      return;
    }

    // Supabase Mode
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
    if (this.isMockMode()) {
      const raw = localStorage.getItem(MOCK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(v => String(v.id) !== String(id));
      localStorage.setItem(MOCK_KEY, JSON.stringify(filtered));
      this.triggerUpdate();
      return;
    }

    const { error } = await supabaseClient
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  activeSubscription: null,

  subscribe(callback) {
    this.onUpdateCallback = callback;
    if (this.isMockMode()) return;

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
    renderAll();
  } catch (err) {
    console.error('Error fetching vehicles:', err);
  }
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
  renderSetupGuideStatus();
}

function renderHeaderStatus() {
  const container = document.getElementById('system-status-header');
  if (!container) return;

  const isMock = vehicleService.isMockMode();
  if (isMock) {
    container.innerHTML = `
      <span class="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">System Status</span>
      <button id="toggle-dev-panel-header" class="text-xs font-mono text-amber-400 flex items-center gap-1.5 hover:text-amber-300 cursor-pointer transition-all uppercase">
        <span class="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
        DEMO_MODE_ACTIVE
      </button>
    `;
  } else {
    container.innerHTML = `
      <span class="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">System Status</span>
      <button id="toggle-dev-panel-header" class="text-xs font-mono text-emerald-400 flex items-center gap-1.5 hover:text-emerald-300 cursor-pointer transition-all uppercase">
        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
        SUPABASE_CONNECTED
      </button>
    `;
  }

  // Bind click trigger instantly
  document.getElementById('toggle-dev-panel-header').addEventListener('click', () => {
    toggleDeveloperPanel(true);
  });
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
      if (!nopol.includes(q) && !supir.includes(q) && !sj.includes(q) && !row.includes(q)) {
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
        <td colspan="${currentTab === 'history' ? 7 : 6}" class="py-12 text-center text-slate-400">
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

    const renderActionButtons = () => {
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

        ${currentTab === 'history' ? `
          <td class="py-4 px-4 text-center font-mono">
            <p class="text-slate-600 text-xs font-semibold">${timeOutFormated}</p>
            <span class="text-[9px] text-slate-400">Gate-Out</span>
          </td>
        ` : ''}

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
    });
  });
}

function renderSetupGuideStatus() {
  const isMock = vehicleService.isMockMode();
  const connStatusText = document.getElementById('conn-status-text');
  if (connStatusText) {
    if (isMock) {
      connStatusText.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-full font-bold">
          <span class="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
          Mode Demo (Aktif)
        </span>
      `;
    } else {
      connStatusText.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-full font-bold">
          <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
          Supabase Terhubung
        </span>
      `;
    }
  }
}

// --- SETUP DEVELOPER/CREDENTIAL PANEL ---
function toggleDeveloperPanel(forceState) {
  const panel = document.getElementById('dev-panel-content');
  const btnText = document.getElementById('toggle-guide-text');
  const chevronIcon = document.getElementById('toggle-guide-chevron');

  showDeveloperPanel = forceState !== undefined ? forceState : !showDeveloperPanel;

  if (showDeveloperPanel) {
    panel.style.display = 'block';
    if (btnText) btnText.innerText = 'Tutup Setup DB';
    if (chevronIcon) {
      chevronIcon.innerHTML = `<svg class="w-4 h-4 text-slate-500 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg>`;
    }
  } else {
    panel.style.display = 'none';
    if (btnText) btnText.innerText = 'Setup Database';
    if (chevronIcon) {
      chevronIcon.innerHTML = `<svg class="w-4 h-4 text-slate-500 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>`;
    }
  }
}

// --- INTERACTIVE BINDINGS ON START ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Sidebar/collapsible Setup DB triggers
  const toggleBtnMain = document.getElementById('toggle-setup-main');
  const toggleBtnHeader = document.getElementById('collapsible-setup-section-btn');

  if (toggleBtnMain) {
    toggleBtnMain.addEventListener('click', () => toggleDeveloperPanel());
  }
  if (toggleBtnHeader) {
    toggleBtnHeader.addEventListener('click', () => toggleDeveloperPanel());
  }

  // 2. Submit Setup Database Credentials Form
  const saveDbForm = document.getElementById('save-db-config-form');
  if (saveDbForm) {
    saveDbForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const urlInput = document.getElementById('db-url-input').value.trim();
      const keyInput = document.getElementById('db-key-input').value.trim();

      if (!urlInput || !keyInput) {
        alert('Toleransi error: Harap isi URL Project dan API Key!');
        return;
      }

      localStorage.setItem('supabase_url', urlInput);
      localStorage.setItem('supabase_anon_key', keyInput);
      
      supabaseUrl = urlInput;
      supabaseAnonKey = keyInput;
      initSupabase();

      // Show temporary beautiful toast
      const alertBox = document.getElementById('db-config-success-alert');
      if (alertBox) {
        alertBox.style.display = 'flex';
        setTimeout(() => {
          alertBox.style.display = 'none';
        }, 5000);
      }

      // Re-trigger reload
      vehicleService.subscribe(() => refreshData());
      refreshData();
    });
  }

  // 3. Reset database config back to Demo mode back-ends
  const useDemoBtn = document.getElementById('use-demo-mode-btn');
  if (useDemoBtn) {
    useDemoBtn.addEventListener('click', () => {
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_anon_key');
      document.getElementById('db-url-input').value = '';
      document.getElementById('db-key-input').value = '';

      supabaseUrl = '';
      supabaseAnonKey = '';
      supabaseClient = null;

      // Reset subscription and re-load
      vehicleService.subscribe(() => refreshData());
      refreshData();
    });
  }

  // Copy SQL command
  const copySqlBtn = document.getElementById('copy-sql-code-btn');
  if (copySqlBtn) {
    copySqlBtn.addEventListener('click', () => {
      const sqlText = `CREATE TABLE vehicles (
  id BIGSERIAL PRIMARY KEY,
  nomor_kendaraan VARCHAR(100) NOT NULL,
  nama_supir VARCHAR(255) NOT NULL,
  nomor_surat_jalan VARCHAR(255) NOT NULL,
  id_row VARCHAR(100) NOT NULL,
  tanggal DATE DEFAULT CURRENT_DATE,
  time_in TIMESTAMPTZ DEFAULT NOW(),
  time_out TIMESTAMPTZ,
  status_bongkar_muat VARCHAR(50) DEFAULT 'Pending',
  durasi VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buka izin RLS penuh untuk sandboxing mudah:
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "RLS Full Access" ON vehicles FOR ALL USING (true) WITH CHECK (true);

-- AKTIFKAN REPLIKASI REAL-TIME WAJIB (PENTING):
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;`;
      navigator.clipboard.writeText(sqlText).then(() => {
        copySqlBtn.innerText = 'Copied!';
        setTimeout(() => {
          copySqlBtn.innerText = 'Copy SQL';
        }, 3000);
      });
    });
  }

  // 4. Checking Check-In Form Submit
  const checkinForm = document.getElementById('vehicle-checkin-form');
  if (checkinForm) {
    checkinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const noKendaraanInput = document.getElementById('no-kendaraan-input');
      const namaSupirInput = document.getElementById('nama-supir-input');
      const noSuratJalanInput = document.getElementById('no-surat-jalan-input');
      const idRowInput = document.getElementById('id-row-input');

      const data = {
        nomor_kendaraan: noKendaraanInput.value.trim(),
        nama_supir: namaSupirInput.value.trim(),
        nomor_surat_jalan: noSuratJalanInput.value.trim(),
        id_row: idRowInput.value.trim() || 'ROW-A1'
      };

      if (!data.nomor_kendaraan || !data.nama_supir || !data.nomor_surat_jalan) {
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

  // 5. Tabs Trigger
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

  // 6. Searching Inputs
  const searchInp = document.getElementById('vehicles-search-input');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderTable();
    });
  }

  // 7. Status filters
  const statFilterMng = document.getElementById('status-filter-select');
  if (statFilterMng) {
    statFilterMng.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      renderTable();
    });
  }

  // 8. CSV Exports Trigger Button
  const exportBtn = document.getElementById('vehicles-export-csv-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportToCSV(vehicles);
    });
  }

  // Fill in active inputs in developer panel if config is present in UI
  document.getElementById('db-url-input').value = supabaseUrl;
  document.getElementById('db-key-input').value = supabaseAnonKey;

  // Load first data
  refreshData();
});
