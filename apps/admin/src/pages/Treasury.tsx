import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import OutletSelector from '../components/OutletSelector';
import { useOutletStore } from '../store/outlet';
import { api, ApiError } from '../api/client';

interface Account {
  id: string;
  outlet_id: string | null;
  outlet_name: string | null;
  name: string;
  type: 'cash' | 'bank' | 'ewallet';
  bank_name: string | null;
  account_number: string | null;
  opening_balance: string;
  balance: string;
  is_active: boolean;
}

interface Movement {
  id: string;
  direction: 'in' | 'out';
  amount: string;
  kind: string;
  reference_type: string | null;
  tx_date: string;
  notes: string | null;
  created_by_name: string | null;
}

interface PendingShift {
  id: string;
  shift_number: number;
  closed_at: string;
  closing_cash_counted: string;
  cash_variance: string;
}

interface Deposit {
  id: string;
  amount: string;
  deposit_date: string;
  notes: string | null;
  account_name: string;
  shift_number: number | null;
  created_by_name: string | null;
}

interface Settlement {
  id: string;
  method: string;
  period_from: string;
  period_to: string;
  system_amount: string;
  actual_amount: string;
  fee_amount: string;
  account_name: string;
  notes: string | null;
}

const TYPE_LABELS: Record<string, string> = { cash: 'Kas Tunai', bank: 'Bank', ewallet: 'E-Wallet' };
const METHOD_LABELS: Record<string, string> = {
  qris: 'QRIS', card: 'Kartu', transfer: 'Transfer', gofood: 'GoFood', grabfood: 'GrabFood',
};
const KIND_LABELS: Record<string, string> = {
  cash_deposit: 'Setoran Kas',
  settlement: 'Settlement',
  expense: 'Pengeluaran',
  purchase_payment: 'Bayar Supplier',
  transfer_in: 'Transfer Masuk',
  transfer_out: 'Transfer Keluar',
  adjustment: 'Koreksi',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function rp(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

export default function Treasury() {
  const [tab, setTab] = useState<'accounts' | 'ledger' | 'deposits' | 'settlements'>('accounts');
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadAccounts() {
    try {
      const res = await api.get<{ accounts: Account[] }>('/accounts');
      setAccounts(res.accounts);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  const tabs = [
    { id: 'accounts', label: 'Rekening' },
    { id: 'ledger', label: 'Mutasi' },
    { id: 'deposits', label: 'Setoran Kas' },
    { id: 'settlements', label: 'Rekonsiliasi' },
  ] as const;

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Kas &amp; Bank</h1>
        <OutletSelector />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === t.id ? 'bg-sky-500 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' && <AccountsTab accounts={accounts} reload={loadAccounts} />}
      {tab === 'ledger' && <LedgerTab accounts={accounts} />}
      {tab === 'deposits' && <DepositsTab accounts={accounts} activeOutletId={activeOutletId} onDone={loadAccounts} />}
      {tab === 'settlements' && <SettlementsTab accounts={accounts} activeOutletId={activeOutletId} onDone={loadAccounts} />}
    </Layout>
  );
}

// --- Accounts ---------------------------------------------------------------

function AccountsTab({ accounts, reload }: { accounts: Account[]; reload: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const total = accounts.filter((a) => a.is_active).reduce((s, a) => s + Number(a.balance), 0);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs text-slate-500">Total saldo (rekening aktif yang terlihat)</div>
        <div className="mt-1 text-2xl font-bold text-slate-900">{rp(total)}</div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setShowForm(true)} className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600">
          + Tambah Rekening
        </button>
        <button onClick={() => setShowTransfer(true)} disabled={accounts.length < 2} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          Transfer Antar Rekening
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Milik</th>
              <th className="px-4 py-3">No. Rekening</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[a.type]}</td>
                <td className="px-4 py-3 text-slate-600">
                  {a.outlet_id ? a.outlet_name : <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Pusat</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {a.bank_name ? `${a.bank_name} ` : ''}{a.account_number ?? '-'}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${Number(a.balance) < 0 ? 'text-red-600' : 'text-slate-900'}`}>{rp(Number(a.balance))}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {a.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada rekening -- tambahkan dulu untuk mulai mencatat kas &amp; bank</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && <AccountModal onClose={() => setShowForm(false)} onSaved={async () => { setShowForm(false); await reload(); }} />}
      {showTransfer && <TransferModal accounts={accounts} onClose={() => setShowTransfer(false)} onSaved={async () => { setShowTransfer(false); await reload(); }} />}
    </>
  );
}

function AccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'cash' | 'bank' | 'ewallet'>('bank');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isCentral, setIsCentral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Nama rekening wajib diisi'); return; }
    setBusy(true); setError(null);
    try {
      await api.post('/accounts', {
        name: name.trim(), type,
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        openingBalance, isCentral,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Tambah Rekening</h2>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-xs text-slate-500">Nama rekening</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. BCA Operasional" className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />

        <label className="mb-1 block text-xs text-slate-500">Jenis</label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
          <option value="bank">Bank</option>
          <option value="cash">Kas Tunai</option>
          <option value="ewallet">E-Wallet</option>
        </select>

        {type !== 'cash' && (
          <>
            <label className="mb-1 block text-xs text-slate-500">Nama bank / penyedia</label>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
            <label className="mb-1 block text-xs text-slate-500">Nomor rekening</label>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
          </>
        )}

        <label className="mb-1 block text-xs text-slate-500">Saldo awal</label>
        <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-6 flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" className="mt-1" checked={isCentral} onChange={(e) => setIsCentral(e.target.checked)} />
          <span>
            Rekening pusat
            <span className="block text-xs text-slate-400">Bisa dipakai semua outlet (mis. rekening induk milik owner)</span>
          </span>
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Tambah'}
          </button>
        </div>
      </form>
    </div>
  );
}

function TransferModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const active = accounts.filter((a) => a.is_active);
  const [fromAccountId, setFrom] = useState(active[0]?.id ?? '');
  const [toAccountId, setTo] = useState(active[1]?.id ?? '');
  const [amount, setAmount] = useState(0);
  const [txDate, setTxDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromAcc = active.find((a) => a.id === fromAccountId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) { setError('Jumlah harus lebih dari 0'); return; }
    setBusy(true); setError(null);
    try {
      await api.post('/accounts/transfer', { fromAccountId, toAccountId, amount, txDate, notes: notes.trim() || undefined });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Transfer Antar Rekening</h2>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-xs text-slate-500">Dari</label>
        <select value={fromAccountId} onChange={(e) => setFrom(e.target.value)} className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {fromAcc && <p className="mb-4 text-xs text-slate-400">Saldo: {rp(Number(fromAcc.balance))}</p>}

        <label className="mb-1 block text-xs text-slate-500">Ke</label>
        <select value={toAccountId} onChange={(e) => setTo(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <label className="mb-1 block text-xs text-slate-500">Jumlah</label>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Tanggal</label>
        <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Catatan</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Memproses...' : 'Transfer'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Ledger -----------------------------------------------------------------

function LedgerTab({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    api
      .get<{ movements: Movement[] }>(`/accounts/${accountId}/ledger?from=${from}&to=${to}`)
      .then((res) => setMovements(res.movements))
      .catch((err) => { if (err instanceof ApiError) setError(err.message); })
      .finally(() => setLoading(false));
  }, [accountId, from, to]);

  const totalIn = movements.filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.amount), 0);
  const totalOut = movements.filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.amount), 0);

  if (accounts.length === 0) return <p className="text-slate-400">Belum ada rekening.</p>;

  return (
    <>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Rekening</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Masuk</div>
          <div className="mt-1 text-lg font-bold text-emerald-600">{rp(totalIn)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Keluar</div>
          <div className="mt-1 text-lg font-bold text-red-600">{rp(totalOut)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Saldo rekening</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{rp(Number(accounts.find((a) => a.id === accountId)?.balance ?? 0))}</div>
        </div>
      </div>

      {loading ? <p className="text-slate-500">Memuat...</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Keterangan</th>
                <th className="px-4 py-3 text-right">Masuk</th>
                <th className="px-4 py-3 text-right">Keluar</th>
                <th className="px-4 py-3">Oleh</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-600">{new Date(m.tx_date).toLocaleDateString('id-ID')}</td>
                  <td className="px-4 py-3 text-slate-700">{KIND_LABELS[m.kind] ?? m.kind}</td>
                  <td className="px-4 py-3 text-slate-500">{m.notes ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-600">{m.direction === 'in' ? rp(Number(m.amount)) : ''}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">{m.direction === 'out' ? rp(Number(m.amount)) : ''}</td>
                  <td className="px-4 py-3 text-slate-500">{m.created_by_name ?? '-'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Tidak ada mutasi di periode ini</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// --- Cash deposits ----------------------------------------------------------

function DepositsTab({ accounts, activeOutletId, onDone }: { accounts: Account[]; activeOutletId: string | null; onDone: () => Promise<void> }) {
  const [pending, setPending] = useState<PendingShift[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PendingShift | 'lump' | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([
        api.get<{ shifts: PendingShift[] }>('/cash-deposits/pending'),
        api.get<{ deposits: Deposit[] }>('/cash-deposits'),
      ]);
      setPending(p.shifts);
      setDeposits(d.deposits);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOutletId]);

  const pendingTotal = pending.reduce((s, p) => s + Number(p.closing_cash_counted ?? 0), 0);

  if (loading) return <p className="text-slate-500">Memuat...</p>;

  return (
    <>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs text-amber-700">Kas shift yang belum disetor</div>
        <div className="mt-1 text-2xl font-bold text-amber-800">{rp(pendingTotal)}</div>
        <div className="text-xs text-amber-600">{pending.length} shift menunggu setoran</div>
      </div>

      <button
        onClick={() => setTarget('lump')}
        disabled={accounts.length === 0}
        className="mb-4 rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600 disabled:opacity-40"
      >
        + Setoran Manual
      </button>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Shift Belum Disetor</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Shift</th>
              <th className="px-4 py-3">Ditutup</th>
              <th className="px-4 py-3 text-right">Kas Dihitung</th>
              <th className="px-4 py-3 text-right">Selisih</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">#{s.shift_number}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(s.closed_at).toLocaleString('id-ID')}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{rp(Number(s.closing_cash_counted ?? 0))}</td>
                <td className={`px-4 py-3 text-right ${Number(s.cash_variance) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{rp(Number(s.cash_variance ?? 0))}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setTarget(s)} disabled={accounts.length === 0} className="text-xs text-sky-600 hover:text-sky-800 disabled:opacity-40">Setor</button>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Semua kas shift sudah disetor</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-700">Riwayat Setoran</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Shift</th>
              <th className="px-4 py-3">Ke Rekening</th>
              <th className="px-4 py-3 text-right">Jumlah</th>
              <th className="px-4 py-3">Oleh</th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-600">{new Date(d.deposit_date).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-3 text-slate-600">{d.shift_number ? `#${d.shift_number}` : '-'}</td>
                <td className="px-4 py-3 text-slate-900">{d.account_name}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{rp(Number(d.amount))}</td>
                <td className="px-4 py-3 text-slate-500">{d.created_by_name ?? '-'}</td>
              </tr>
            ))}
            {deposits.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Belum ada setoran</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {target && (
        <DepositModal
          accounts={accounts}
          shift={target === 'lump' ? null : target}
          onClose={() => setTarget(null)}
          onSaved={async () => { setTarget(null); await load(); await onDone(); }}
        />
      )}
    </>
  );
}

function DepositModal({ accounts, shift, onClose, onSaved }: { accounts: Account[]; shift: PendingShift | null; onClose: () => void; onSaved: () => void }) {
  const active = accounts.filter((a) => a.is_active);
  const [toAccountId, setToAccountId] = useState(active[0]?.id ?? '');
  const [amount, setAmount] = useState(shift ? Number(shift.closing_cash_counted ?? 0) : 0);
  const [depositDate, setDepositDate] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) { setError('Jumlah harus lebih dari 0'); return; }
    setBusy(true); setError(null);
    try {
      await api.post('/cash-deposits', {
        toAccountId, shiftId: shift?.id, amount, depositDate, notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Setoran Kas</h2>
        <p className="mb-4 text-xs text-slate-500">{shift ? `Dari shift #${shift.shift_number}` : 'Setoran manual (tanpa shift tertentu)'}</p>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="mb-1 block text-xs text-slate-500">Ke rekening</label>
        <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <label className="mb-1 block text-xs text-slate-500">Jumlah</label>
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />

        <label className="mb-1 block text-xs text-slate-500">Tanggal setor</label>
        <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <label className="mb-1 block text-xs text-slate-500">Catatan</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Setor'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Settlements ------------------------------------------------------------

function SettlementsTab({ accounts, activeOutletId, onDone }: { accounts: Account[]; activeOutletId: string | null; onDone: () => Promise<void> }) {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const [expected, setExpected] = useState<{ method: string; system_amount: string; payment_count: string; already_settled: string }[]>([]);
  const [history, setHistory] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ method: string; systemAmount: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [e, h] = await Promise.all([
        api.get<{ methods: typeof expected }>(`/settlements/expected?from=${from}&to=${to}`),
        api.get<{ settlements: Settlement[] }>('/settlements'),
      ]);
      setExpected(e.methods);
      setHistory(h.settlements);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, activeOutletId]);

  return (
    <>
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
        Bandingkan penjualan non-tunai menurut POS dengan uang yang <strong>benar-benar masuk rekening</strong>.
        Selisihnya dicatat sebagai biaya/komisi -- GoFood &amp; GrabFood memotong komisi, jadi angkanya memang tidak akan sama.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Periode dari</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sampai</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />
        </div>
      </div>

      {loading ? <p className="text-slate-500">Memuat...</p> : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Menurut POS (periode ini)</h2>
          <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3 text-right">Transaksi</th>
                  <th className="px-4 py-3 text-right">Nilai POS</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expected.map((m) => (
                  <tr key={m.method} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{METHOD_LABELS[m.method] ?? m.method}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{m.payment_count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{rp(Number(m.system_amount))}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setTarget({ method: m.method, systemAmount: Number(m.system_amount) })}
                        disabled={accounts.length === 0}
                        className="text-xs text-sky-600 hover:text-sky-800 disabled:opacity-40"
                      >
                        Rekonsiliasi
                      </button>
                    </td>
                  </tr>
                ))}
                {expected.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Tidak ada transaksi non-tunai di periode ini</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-700">Riwayat Rekonsiliasi</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Periode</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3 text-right">Nilai POS</th>
                  <th className="px-4 py-3 text-right">Masuk Rekening</th>
                  <th className="px-4 py-3 text-right">Biaya/Komisi</th>
                  <th className="px-4 py-3">Rekening</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(s.period_from).toLocaleDateString('id-ID')} &ndash; {new Date(s.period_to).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{METHOD_LABELS[s.method] ?? s.method}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{rp(Number(s.system_amount))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{rp(Number(s.actual_amount))}</td>
                    <td className={`px-4 py-3 text-right ${Number(s.fee_amount) > 0 ? 'text-red-600' : 'text-slate-500'}`}>{rp(Number(s.fee_amount))}</td>
                    <td className="px-4 py-3 text-slate-600">{s.account_name}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada rekonsiliasi</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {target && (
        <SettlementModal
          accounts={accounts}
          method={target.method}
          systemAmount={target.systemAmount}
          periodFrom={from}
          periodTo={to}
          onClose={() => setTarget(null)}
          onSaved={async () => { setTarget(null); await load(); await onDone(); }}
        />
      )}
    </>
  );
}

function SettlementModal({
  accounts, method, systemAmount, periodFrom, periodTo, onClose, onSaved,
}: {
  accounts: Account[]; method: string; systemAmount: number; periodFrom: string; periodTo: string;
  onClose: () => void; onSaved: () => void;
}) {
  const active = accounts.filter((a) => a.is_active);
  const [toAccountId, setToAccountId] = useState(active[0]?.id ?? '');
  const [actualAmount, setActualAmount] = useState(systemAmount);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = systemAmount - actualAmount;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post('/settlements', { method, periodFrom, periodTo, actualAmount, toAccountId, notes: notes.trim() || undefined });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="mb-1 text-lg font-bold text-slate-900">Rekonsiliasi {METHOD_LABELS[method] ?? method}</h2>
        <p className="mb-4 text-xs text-slate-500">
          {new Date(periodFrom).toLocaleDateString('id-ID')} &ndash; {new Date(periodTo).toLocaleDateString('id-ID')}
        </p>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">Menurut POS</div>
          <div className="text-lg font-bold text-slate-900">{rp(systemAmount)}</div>
        </div>

        <label className="mb-1 block text-xs text-slate-500">Jumlah yang benar-benar masuk rekening</label>
        <input type="number" value={actualAmount} onChange={(e) => setActualAmount(Number(e.target.value))} className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" autoFocus />
        <div className={`mb-4 text-sm font-medium ${fee > 0 ? 'text-red-600' : fee < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {fee > 0 ? `Biaya/komisi: ${rp(fee)}` : fee < 0 ? `Lebih ${rp(-fee)} dari catatan POS -- periksa lagi` : 'Cocok persis'}
        </div>

        <label className="mb-1 block text-xs text-slate-500">Masuk ke rekening</label>
        <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500">
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <label className="mb-1 block text-xs text-slate-500">Catatan</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500" />

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-slate-100 py-2.5 text-slate-700 hover:bg-slate-200">Batal</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-sky-500 py-2.5 font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            {busy ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}
