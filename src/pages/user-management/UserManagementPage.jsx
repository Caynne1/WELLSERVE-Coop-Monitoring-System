import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, UserCog, Shield, ShieldOff, Pencil,
  Users, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Eye, EyeOff, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import {
  getUsers,
  createUser,
  updateUser,
  setUserStatus,
  updateUserPermissions,
  DEFAULT_PERMISSIONS,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  APPROVAL_MODULES,
} from '../../services/userManagementService';
import { trackActivity } from '../../services/logService';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const ROLE_OPTIONS = [
  { value: 'staff',            label: 'Staff' },
  { value: 'manager',          label: 'General Manager' },
  { value: 'auditor',          label: 'Auditor' },
  { value: 'accountant',       label: 'Accountant / Treasurer' },
  { value: 'committee',        label: 'Committee' },
  { value: 'credit_committee', label: 'Credit Committee' },
  { value: 'admin',            label: 'Administrator' },
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(role => [role.value, role.label]));

function buildPermissionPreset(overrides = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_PERMISSIONS).map(([module, actions]) => [
      module,
      { ...actions, ...(overrides[module] || {}) },
    ])
  );
}

// Applied automatically when an admin picks "Credit Committee" as the role,
// so the new user can see what they need out of the box. Still editable
// afterward via the Permissions tab — this is just a sensible starting point.
// Approval is never granted by role name alone. Administrators may enable the
// Loans "approve" permission for the appropriate committee account.
const CREDIT_COMMITTEE_DEFAULT_PERMISSIONS = buildPermissionPreset({
  loans:   { view: true, create: false, edit: false, delete: false },
  members: { view: true, create: false, edit: false, delete: false },
});

const READ_ONLY_PERMISSIONS = buildPermissionPreset({
  logs: { view: true, create: false, edit: false, delete: false },
});

const ACCOUNTANT_DEFAULT_PERMISSIONS = buildPermissionPreset({
  cbu:                { view: true, create: true, edit: true, delete: false },
  savings:            { view: true, create: true, edit: true, delete: false },
  time_deposit:       { view: true, create: true, edit: true, delete: false },
  savings_booster:    { view: true, create: true, edit: true, delete: false },
  account_monitoring: { view: true, create: true, edit: true, delete: false },
  transactions:       { view: true, create: true, edit: true, delete: false },
  checkbook:          { view: true, create: true, edit: true, delete: false },
  invoices:           { view: true, create: true, edit: true, delete: false },
  vouchers:           { view: true, create: true, edit: true, delete: false },
  expenses:           { view: true, create: true, edit: true, delete: false },
  reports:            { view: true, create: false, edit: false, delete: false },
});

const MANAGER_DEFAULT_PERMISSIONS = Object.fromEntries(
  Object.keys(DEFAULT_PERMISSIONS).map(module => [
    module,
    module === 'settings'
      ? { view: false, create: false, edit: false, delete: false }
      : { view: true, create: true, edit: true, delete: false },
  ])
);

const ADMIN_DEFAULT_PERMISSIONS = Object.fromEntries(
  Object.keys(DEFAULT_PERMISSIONS).map(module => [
    module,
    {
      view: true,
      create: true,
      edit: true,
      delete: true,
      approve: APPROVAL_MODULES.includes(module),
    },
  ])
);

const ROLE_PERMISSION_PRESETS = {
  staff: DEFAULT_PERMISSIONS,
  manager: MANAGER_DEFAULT_PERMISSIONS,
  auditor: READ_ONLY_PERMISSIONS,
  accountant: ACCOUNTANT_DEFAULT_PERMISSIONS,
  committee: READ_ONLY_PERMISSIONS,
  credit_committee: CREDIT_COMMITTEE_DEFAULT_PERMISSIONS,
  admin: ADMIN_DEFAULT_PERMISSIONS,
};

const STATUS_META = {
  active:   { label: 'Active',   variant: 'success', icon: CheckCircle2 },
  inactive: { label: 'Inactive', variant: 'danger',  icon: XCircle },
};

const ROLE_PILL_CLASS = {
  admin: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  manager: 'border-purple-200 bg-purple-50 text-purple-700',
  auditor: 'border-amber-200 bg-amber-50 text-amber-700',
  accountant: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  committee: 'border-teal-200 bg-teal-50 text-teal-700',
  credit_committee: 'border-blue-200 bg-blue-50 text-blue-700',
  staff: 'border-gray-200 bg-gray-50 text-gray-600',
};

const STATUS_PILL_CLASS = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  inactive: 'border-red-200 bg-red-50 text-red-700',
};

function UserAccessTabs({ tab, onChange }) {
  const tabs = [
    { key: 'info', label: 'Account Info', icon: UserCog },
    { key: 'permissions', label: 'Permissions', icon: Shield },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
      {tabs.map(({ key, label, icon: Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-[#07A04E] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:text-[#078B45]'
            }`}
          >
            <Icon size={15} strokeWidth={2.2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Permission Matrix Component ──────────────────────────────────────────────
function PermissionMatrix({ permissions, onChange, readOnly = false }) {
  const groups = [...new Set(PERMISSION_MODULES.map(m => m.group))];

  function actionsForModule(moduleKey) {
    return PERMISSION_ACTIONS.filter(action => action !== 'approve' || APPROVAL_MODULES.includes(moduleKey));
  }

  function toggle(moduleKey, action) {
    if (readOnly) return;
    const next = {
      ...permissions,
      [moduleKey]: {
        ...permissions[moduleKey],
        [action]: !permissions[moduleKey]?.[action],
      },
    };
    // If un-viewing, clear all other actions
    if (action === 'view' && permissions[moduleKey]?.view) {
      next[moduleKey] = { view: false, create: false, edit: false, delete: false, approve: false };
    }
    onChange(next);
  }

  function toggleAll(moduleKey, checked) {
    if (readOnly) return;
    const nextActions = Object.fromEntries(
      PERMISSION_ACTIONS.map(action => [
        action,
        action === 'approve' && !APPROVAL_MODULES.includes(moduleKey) ? false : checked,
      ])
    );
    onChange({
      ...permissions,
      [moduleKey]: nextActions,
    });
  }

  function isAllChecked(moduleKey) {
    return actionsForModule(moduleKey).every(a => permissions[moduleKey]?.[a]);
  }

  function isIndeterminate(moduleKey) {
    const actions = actionsForModule(moduleKey);
    const checked = actions.filter(a => permissions[moduleKey]?.[a]);
    return checked.length > 0 && checked.length < actions.length;
  }

  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {group}
          </p>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_repeat(5,_60px)] bg-gray-50 border-b border-gray-100">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500">Module</div>
              {PERMISSION_ACTIONS.map(a => (
                <div key={a} className="py-2 text-center text-xs font-semibold text-gray-500 capitalize">
                  {a}
                </div>
              ))}
            </div>

            {PERMISSION_MODULES.filter(m => m.group === group).map((mod, idx, arr) => {
              const perms = permissions[mod.key] || {};
              const isLast = idx === arr.length - 1;
              const allCheck = isAllChecked(mod.key);
              const indeterminate = isIndeterminate(mod.key);

              return (
                <div
                  key={mod.key}
                  className={[
                    'grid grid-cols-[1fr_repeat(5,_60px)] items-center',
                    !isLast && 'border-b border-gray-50',
                    !readOnly && 'hover:bg-emerald-50/30 transition-colors',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Module name + select-all checkbox */}
                  <div className="px-4 py-2.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allCheck}
                      ref={el => { if (el) el.indeterminate = indeterminate; }}
                      onChange={e => toggleAll(mod.key, e.target.checked)}
                      disabled={readOnly}
                      className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer disabled:cursor-default"
                    />
                    <span className="text-sm text-gray-700">{mod.label}</span>
                  </div>

                  {PERMISSION_ACTIONS.map(action => {
                    const isViewDisabled = action !== 'view' && !perms.view;
                    const isNotApplicable = action === 'approve' && !APPROVAL_MODULES.includes(mod.key);
                    return (
                      <div key={action} className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={!!perms[action]}
                          onChange={() => toggle(mod.key, action)}
                          disabled={readOnly || isViewDisabled || isNotApplicable}
                          title={isNotApplicable ? 'Approval is not applicable to this module' : isViewDisabled ? 'Enable "view" first' : ''}
                          className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer disabled:cursor-default disabled:opacity-40"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose, onCreated }) {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'staff', position_title: '',
  });
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [permissionsTouched, setPermissionsTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('info'); // 'info' | 'permissions'

  function validate() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Minimum 8 characters';
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    try {
      const user = await createUser({ ...form, permissions });
      toast.success(`User account created for ${form.full_name}`);
      trackActivity({
        userId: currentUser?.id,
        module: 'user_management',
        action: 'create',
        description: `Created user account "${form.full_name}" (role: ${form.role}${form.position_title ? `, position: ${form.position_title}` : ''})`,
        recordId: user?.id,
      });
      onCreated(user);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  }

  function resetAndClose() {
    setForm({ full_name: '', email: '', password: '', role: 'staff', position_title: '' });
    setPermissions(DEFAULT_PERMISSIONS);
    setPermissionsTouched(false);
    setErrors({});
    setTab('info');
    onClose();
  }

  function handleRoleChange(role) {
    setForm(p => ({ ...p, role }));
    // Give Credit Committee a sensible starting point (they at least need to
    // see loans/members to do the job); leave it alone if the admin already
    // hand-edited the permission matrix.
    if (!permissionsTouched) {
      setPermissions(ROLE_PERMISSION_PRESETS[role] || DEFAULT_PERMISSIONS);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Create User Account" size="lg">
      <UserAccessTabs tab={tab} onChange={setTab} />

      {tab === 'info' && (
        <div className="space-y-4">
          <Input
            label="Full Name" required
            value={form.full_name}
            onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
            error={errors.full_name}
            placeholder="Your Full Name"
          />
          <Input
            label="Email Address" type="email" required
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            error={errors.email}
            placeholder="user@wellserve.coop"
          />
          <div className="relative">
            <Input
              label="Password" type={showPassword ? 'text' : 'password'} required
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              error={errors.password}
              placeholder="Min. 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <Select
            label="System Role" required
            value={form.role}
            onChange={e => handleRoleChange(e.target.value)}
            options={ROLE_OPTIONS}
          />
          <Input
            label="Position / Designation"
            value={form.position_title}
            onChange={e => setForm(p => ({ ...p, position_title: e.target.value }))}
            placeholder="e.g. Bookkeeper, Loan Officer, Board Secretary"
          />
          <p className="-mt-2 text-xs text-gray-400">
            Optional. This identifies the cooperative position; access is controlled by the system role and permissions.
          </p>
          {form.role === 'credit_committee' && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex gap-2.5">
              <Shield size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                This role starts with Loans and Members view access only. Enable the Loans
                Approve permission when this account is authorized to decide applications.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 flex gap-2.5">
            <Lock size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              The new user will receive an email to verify their account. 
              They can log in once verified.
            </p>
          </div>
        </div>
      )}

      {tab === 'permissions' && (
        <div>
          <p className="text-xs text-gray-500 mb-4">
            Set what this user can access. Admins have full access regardless.
          </p>
          <PermissionMatrix
            permissions={permissions}
            onChange={p => { setPermissions(p); setPermissionsTouched(true); }}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={loading} icon={<Plus size={14} />}>
          Create Account
        </Button>
      </div>
    </Modal>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({ open, onClose, user, onUpdated }) {
  const { user: currentUser, profile: currentProfile } = useAuth();
  const [form, setForm] = useState({ full_name: '', role: 'staff', position_title: '' });
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [tab, setTab] = useState('info');

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        role: user.role || 'staff',
        position_title: user.position_title || '',
      });
      setPermissions(user.permissions || DEFAULT_PERMISSIONS);
      setTab('info');
    }
  }, [user]);

  async function handleSave() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Full name is required';
    if (Object.keys(e).length) { setErrors(e); return; }

    setLoading(true);
    try {
      const originalPermissions = user.permissions || DEFAULT_PERMISSIONS;
      const changedModules = PERMISSION_MODULES.filter(mod => {
        const before = originalPermissions[mod.key] || {};
        const after = permissions[mod.key] || {};
        return PERMISSION_ACTIONS.some(a => !!before[a] !== !!after[a]);
      }).map(mod => mod.label);
      const roleChanged = form.role !== user.role;

      const updated = await updateUser(user.id, {
        full_name: form.full_name,
        role: form.role,
        position_title: form.position_title.trim() || null,
        permissions,
      });
      toast.success('User updated successfully');

      const changeParts = [];
      if (roleChanged) changeParts.push(`role changed from ${user.role} to ${form.role}`);
      if (changedModules.length) changeParts.push(`permissions updated for: ${changedModules.join(', ')}`);
      trackActivity({
        userId: currentUser?.id,
        module: 'user_management',
        action: 'update',
        description: changeParts.length
          ? `Updated user account "${form.full_name}" — ${changeParts.join('; ')}`
          : `Updated user account "${form.full_name}"`,
        recordId: user.id,
      });

      onUpdated(updated);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  }

  const isSelf = user?.id === currentProfile?.id;
  const readOnlyPerms = form.role === 'admin';

  return (
    <Modal open={open} onClose={onClose} title="Edit User" size="lg">
      <UserAccessTabs tab={tab} onChange={setTab} />

      {tab === 'info' && (
        <div className="space-y-4">
          <Input
            label="Full Name" required
            value={form.full_name}
            onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
            error={errors.full_name}
          />
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              {user?.email}
            </p>
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
          </div>
          <Select
            label="System Role" required
            value={form.role}
            onChange={e => {
              const role = e.target.value;
              setForm(p => ({ ...p, role }));
              setPermissions(ROLE_PERMISSION_PRESETS[role] || DEFAULT_PERMISSIONS);
            }}
            options={ROLE_OPTIONS}
            disabled={isSelf}
          />
          <Input
            label="Position / Designation"
            value={form.position_title}
            onChange={e => setForm(p => ({ ...p, position_title: e.target.value }))}
            placeholder="e.g. Bookkeeper, Loan Officer, Board Secretary"
          />
          {isSelf && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <Lock size={12} /> You cannot change your own role.
            </p>
          )}
          {form.role === 'credit_committee' && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex gap-2.5">
              <Shield size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700">
                <p>
                  The Credit Committee role does not automatically grant approval. Enable the
                  Loans Approve permission below when this account is authorized to approve.
                </p>
                <button
                  type="button"
                  onClick={() => setPermissions(CREDIT_COMMITTEE_DEFAULT_PERMISSIONS)}
                  className="mt-1.5 font-semibold underline hover:no-underline"
                >
                  Apply recommended Loans/Members view access
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'permissions' && (
        <div>
          {readOnlyPerms ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex gap-2.5 mb-4">
              <Shield size={15} className="text-[#000066] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[#000066]">
                Admin role has unrestricted access to all modules. Permissions are not applicable.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-4">
              Customize what this user can access and perform.
            </p>
          )}
          <PermissionMatrix
            permissions={readOnlyPerms ? ADMIN_DEFAULT_PERMISSIONS : permissions}
            onChange={setPermissions}
            readOnly={readOnlyPerms}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="blue" onClick={handleSave} loading={loading} icon={<Pencil size={14} />}>
          Save Changes
        </Button>
      </div>
    </Modal>
  );
}

// ─── Permissions Viewer Modal ─────────────────────────────────────────────────
function PermissionsViewerModal({ open, onClose, user }) {
  if (!user) return null;
  const perms = user.permissions || DEFAULT_PERMISSIONS;
  const isAdmin = user.role === 'admin';

  return (
    <Modal open={open} onClose={onClose} title={`Permissions — ${user.full_name || user.email}`} size="lg">
      {isAdmin ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-4 flex gap-3 mb-4">
          <Shield size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">Full Admin Access</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              This user has unrestricted access to all modules.
            </p>
          </div>
        </div>
      ) : (
        <PermissionMatrix permissions={perms} onChange={() => {}} readOnly />
      )}
      <div className="flex justify-end mt-4">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ user, onEdit, onToggleStatus, onViewPermissions, isSelf }) {
  const { profile: currentProfile } = useAuth();
  const status = STATUS_META[user.status] || STATUS_META.active;
  const roleLabel = ROLE_LABELS[user.role] || user.role || 'Staff';

  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-emerald-700">
              {(user.full_name || user.email || '?')[0].toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {user.full_name || '—'}
              {isSelf && (
                <span className="ml-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                  You
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-center">
          <span className={`inline-flex min-w-[110px] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${ROLE_PILL_CLASS[user.role] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
            {roleLabel}
          </span>
        </div>
      </td>
      <td className="px-5 py-3 text-center text-sm text-gray-600">
        {user.position_title || <span className="text-gray-300">Not specified</span>}
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-center">
          <span className={`inline-flex min-w-[86px] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_PILL_CLASS[user.status || 'active'] || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
            {status.label}
          </span>
        </div>
      </td>
      <td className="px-5 py-3 text-xs text-gray-400">{formatDate(user.created_at)}</td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-1 justify-end">
          {/* View permissions */}
          <button
            onClick={() => onViewPermissions(user)}
            title="View permissions"
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
          >
            <Shield size={14} />
          </button>

          {/* Edit */}
          <button
            onClick={() => onEdit(user)}
            title="Edit user"
            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <Pencil size={14} />
          </button>

          {/* Toggle status */}
          {!isSelf && (
            <button
              onClick={() => onToggleStatus(user)}
              title={user.status === 'active' ? 'Deactivate' : 'Activate'}
              className={[
                'p-1.5 rounded-lg transition-colors',
                user.status === 'active'
                  ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                  : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50',
              ].join(' ')}
            >
              {user.status === 'active' ? <ShieldOff size={14} /> : <Shield size={14} />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const { user: currentUser, profile: currentProfile } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterRole, setFilterRole]     = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [createOpen, setCreateOpen]   = useState(false);
  const [editUser, setEditUser]       = useState(null);
  const [viewPermsUser, setViewPermsUser] = useState(null);
  const [toggleTarget, setToggleTarget]  = useState(null); // for confirm dialog

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtered list ──
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.position_title?.toLowerCase().includes(q);
    const matchRole   = filterRole   === 'all' || u.role   === filterRole;
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  // ── Stats ──
  const total    = users.length;
  const active   = users.filter(u => u.status !== 'inactive').length;
  const admins   = users.filter(u => u.role === 'admin').length;
  const inactive = users.filter(u => u.status === 'inactive').length;

  // ── Handlers ──
  function handleCreated(user) {
    setUsers(prev => [user, ...prev]);
  }

  function handleUpdated(updated) {
    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
  }

  async function confirmToggleStatus() {
    if (!toggleTarget) return;
    const newStatus = toggleTarget.status === 'active' ? 'inactive' : 'active';
    try {
      await setUserStatus(toggleTarget.id, newStatus);
      setUsers(prev => prev.map(u =>
        u.id === toggleTarget.id ? { ...u, status: newStatus } : u
      ));
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      trackActivity({
        userId: currentUser?.id,
        module: 'user_management',
        action: newStatus === 'active' ? 'reactivate' : 'deactivate',
        description: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} user account "${toggleTarget.full_name || toggleTarget.email}"`,
        recordId: toggleTarget.id,
      });
    } catch {
      toast.error('Failed to update status');
    } finally {
      setToggleTarget(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="User & Access Management"
        subtitle="Manage system accounts, cooperative positions, roles, and access permissions"
        action={
          <Button icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
            Add User
          </Button>
        }
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Users',  value: total,    icon: Users,        color: 'text-gray-600',    bg: 'bg-gray-100' },
          { label: 'Active',       value: active,   icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Inactive',     value: inactive, icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-100' },
          { label: 'Admins',       value: admins,   icon: Shield,       color: 'text-[#000066]',   bg: 'bg-blue-100' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
              <stat.icon size={16} className={stat.color} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or position..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Role filter */}
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Roles</option>
          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <span className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['User', 'System Role', 'Position / Designation', 'Status', 'Created', 'Actions'].map(h => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                        ['System Role', 'Position / Designation', 'Status'].includes(h)
                          ? 'text-center'
                          : h === 'Actions'
                            ? 'text-right'
                            : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-gray-400">
                      <UserCog size={36} className="mx-auto mb-2 text-gray-200" />
                      <p className="text-sm">No users found</p>
                    </td>
                  </tr>
                ) : filtered.map(u => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentProfile?.id}
                    onEdit={setEditUser}
                    onToggleStatus={setToggleTarget}
                    onViewPermissions={setViewPermsUser}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <EditUserModal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        user={editUser}
        onUpdated={handleUpdated}
      />

      <PermissionsViewerModal
        open={!!viewPermsUser}
        onClose={() => setViewPermsUser(null)}
        user={viewPermsUser}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={confirmToggleStatus}
        title={toggleTarget?.status === 'active' ? 'Deactivate User' : 'Activate User'}
        message={
          toggleTarget?.status === 'active'
            ? `Deactivate ${toggleTarget?.full_name || toggleTarget?.email}? They will no longer be able to log in.`
            : `Activate ${toggleTarget?.full_name || toggleTarget?.email}? They will regain access.`
        }
      />
    </div>
  );
}
