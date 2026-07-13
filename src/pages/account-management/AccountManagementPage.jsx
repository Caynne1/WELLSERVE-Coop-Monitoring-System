import { useEffect, useState } from 'react';
import {
  Search,
  UserPlus,
  Users,
  ShieldCheck,
  ShieldOff,
  Eye,
  EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { useAuth } from '../../context/AuthContext';
import {
  getManagedAccounts,
  createAccount,
  deactivateAccount,
  reactivateAccount,
} from '../../services/accountManagementService';
import { formatDate } from '../../utils/formatters';

const statusVariant = { active: 'success', inactive: 'danger' };
const roleVariant = { admin: 'navy', staff: 'default' };

// ── Main page ─────────────────────────────────────────────────
export default function AccountManagementPage() {
  const { profile: adminProfile } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      setLoading(true);
      const data = await getManagedAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('[AccountManagementPage] fetchAccounts error:', err);
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load accounts
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchAccounts(); }}
            >
              Retry
            </button>
          </span>
        ),
        { duration: 6000 }
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusToggle() {
    if (!confirmAction || toggling) return;

    const { account, action } = confirmAction;

    setToggling(true);
    try {
      if (action === 'deactivate') {
        await deactivateAccount(account.id);
        toast.success(`${account.full_name || account.email} deactivated.`);
      } else {
        await reactivateAccount(account.id);
        toast.success(`${account.full_name || account.email} reactivated.`);
      }

      setConfirmAction(null);
      fetchAccounts();
    } catch (err) {
      console.error('[AccountManagementPage] handleStatusToggle error:', err);
      toast.error(err.message || 'Action failed');
    } finally {
      setToggling(false);
    }
  }


  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.full_name?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q) ||
      a.role?.toLowerCase().includes(q)
    );
  });

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(filtered, { pageSize: 25 });

  useEffect(() => {
    setPage(1);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <PageHeader
        title="Account Management"
        subtitle="Manage system user accounts and access"
        action={
          <Button icon={<UserPlus size={15} />} onClick={() => setShowCreate(true)}>
            Add Account
          </Button>
        }
      />

      {/* Search + count */}
      <div className="mt-5 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent
              w-72 bg-white shadow-sm"
          />
        </div>

        {!loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Users size={14} />
            <span>{filtered.length} of {accounts.length} accounts</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {['Full Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                          i === 5 ? 'text-right' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Users size={32} className="text-gray-200" />
                        <p className="text-sm">
                          {search
                            ? 'No accounts match your search.'
                            : 'No accounts yet. Add the first one.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageItems.map((account) => {
                    const isSelf = account.id === adminProfile?.id;
                    const isActive = account.status !== 'inactive';

                    return (
                      <tr
                        key={account.id}
                        className="hover:bg-[#D6FADC]/20 transition-colors"
                      >
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
                              style={{ background: '#D6FADC', color: '#07A04E' }}
                            >
                              {(account.full_name?.[0] || account.email?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {account.full_name || '—'}
                                {isSelf && (
                                  <span className="ml-2 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                    you
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 text-gray-500">{account.email || '—'}</td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <Badge variant={roleVariant[account.role] || 'default'} dot>
                            {account.role || '—'}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant[account.status] || 'default'} dot>
                            {account.status || 'active'}
                          </Badge>
                        </td>

                        {/* Created */}
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {account.created_at ? formatDate(account.created_at) : '—'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end">
                            {isSelf ? (
                              <span className="text-xs text-gray-400 italic">
                                Your account
                              </span>
                            ) : isActive ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({ account, action: 'deactivate' })
                                }
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg
                                  text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-colors"
                              >
                                <ShieldOff size={13} /> Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({ account, action: 'reactivate' })
                                }
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg
                                  text-[#07A04E] bg-[#D6FADC] hover:bg-[#c0f5c8] border border-[#07A04E]/20 transition-colors"
                              >
                                <ShieldCheck size={13} /> Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
              <p className="text-xs text-gray-400">
                Showing <span className="font-medium text-gray-600">{filtered.length}</span>{' '}
                of <span className="font-medium text-gray-600">{accounts.length}</span>{' '}
                accounts
              </p>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="accounts"
          />
        </div>
      )}

      <CreateAccountModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          fetchAccounts();
        }}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.action === 'deactivate'
            ? 'Deactivate Account'
            : 'Reactivate Account'
        }
        message={
          confirmAction?.action === 'deactivate'
            ? `Deactivate ${
                confirmAction?.account?.full_name || confirmAction?.account?.email
              }? They will lose system access until reactivated.`
            : `Reactivate ${
                confirmAction?.account?.full_name || confirmAction?.account?.email
              }? They will regain system access.`
        }
        confirmLabel={
          confirmAction?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'
        }
        confirmVariant={
          confirmAction?.action === 'deactivate' ? 'danger' : 'primary'
        }
        loading={toggling}
        onConfirm={handleStatusToggle}
        onCancel={() => { if (!toggling) setConfirmAction(null); }}
      />
    </div>
  );
}

// ── Create Account Modal ───────────────────────────────────────
function CreateAccountModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'staff',
  });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});

  function reset() {
    setForm({ full_name: '', email: '', password: '', role: 'staff' });
    setErrors({});
    setShowPw(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function validate() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Invalid email.';
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Minimum 8 characters.';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();

    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setLoading(true);

    try {
      await createAccount({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
      });

      toast.success(`Account created for ${form.full_name}.`);
      reset();
      onSuccess();
    } catch (err) {
      console.error('[CreateAccountModal] createAccount error:', err);
      toast.error(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add New Account" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            placeholder="Your Full Name"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent"
          />
          {errors.full_name && (
            <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="staff@wellserve.coop"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent"
          />
          {errors.email && (
            <p className="text-xs text-red-500 mt-1">{errors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Minimum 8 characters"
              className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-red-500 mt-1">{errors.password}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Role
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent bg-white"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div
          className="p-3 rounded-xl text-xs"
          style={{
            background: '#D6FADC60',
            border: '1px solid rgba(7,160,78,0.18)',
          }}
        >
          <p style={{ color: '#273C2C' }}>
            The account will be <strong>Active</strong> immediately. Share the
            credentials with the staff member after creation.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} icon={<UserPlus size={14} />}>
            Create Account
          </Button>
        </div>
      </form>
    </Modal>
  );
}