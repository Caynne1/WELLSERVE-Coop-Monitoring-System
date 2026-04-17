import { useState } from 'react';
import { User, Lock, Eye, EyeOff, CheckCircle2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

// ─── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#07A04E]/10 flex items-center justify-center">
          <Icon size={16} className="text-[#07A04E]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Password Input ────────────────────────────────────────────────────────────
function PasswordInput({ label, required, value, onChange, error, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`px-3 py-2 pr-10 text-sm border rounded-lg w-full
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition
            ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}
            disabled:bg-gray-100 disabled:cursor-not-allowed`}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Password Strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;

  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Number or symbol', pass: /[0-9!@#$%^&*]/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-[#07A04E]'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i < score ? colors[score - 1] : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-medium ${
          score <= 1 ? 'text-red-500' : score === 2 ? 'text-orange-500' : score === 3 ? 'text-yellow-600' : 'text-[#07A04E]'
        }`}>
          {labels[score - 1] ?? ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-1.5">
            <CheckCircle2
              size={12}
              className={c.pass ? 'text-[#07A04E]' : 'text-gray-300'}
            />
            <span className={`text-xs ${c.pass ? 'text-gray-700' : 'text-gray-400'}`}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, profile } = useAuth();

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name ?? '',
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  // ── Profile save ──────────────────────────────────────────────────────────
  async function handleSaveProfile(e) {
    e.preventDefault();
    const errors = {};
    if (!profileForm.full_name.trim()) errors.full_name = 'Full name is required.';
    if (Object.keys(errors).length) { setProfileErrors(errors); return; }
    setProfileErrors({});

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: profileForm.full_name.trim() })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Profile updated successfully.');
    } catch (err) {
      toast.error(err.message ?? 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Password save ─────────────────────────────────────────────────────────
  async function handleChangePassword(e) {
    e.preventDefault();
    const errors = {};
    if (!pwForm.current_password) errors.current_password = 'Current password is required.';
    if (!pwForm.new_password) errors.new_password = 'New password is required.';
    else if (pwForm.new_password.length < 8) errors.new_password = 'Password must be at least 8 characters.';
    if (!pwForm.confirm_password) errors.confirm_password = 'Please confirm your new password.';
    else if (pwForm.new_password !== pwForm.confirm_password) errors.confirm_password = 'Passwords do not match.';
    if (Object.keys(errors).length) { setPwErrors(errors); return; }
    setPwErrors({});

    setSavingPw(true);
    try {
      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pwForm.current_password,
      });
      if (signInError) {
        setPwErrors({ current_password: 'Current password is incorrect.' });
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: pwForm.new_password,
      });
      if (updateError) throw updateError;

      toast.success('Password changed successfully.');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err.message ?? 'Failed to change password.');
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Account Settings"
        subtitle="Manage your profile and security preferences."
      />

      <div className="mt-6 space-y-5">
        {/* ── Account Info (read-only) ── */}
        <SectionCard
          icon={ShieldCheck}
          title="Account Information"
          subtitle="Your account details on record."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email</p>
              <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                {user?.email ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Role</p>
              <p className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 capitalize">
                {profile?.role ?? '—'}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Email and role cannot be changed here. Contact the administrator if updates are needed.
          </p>
        </SectionCard>

        {/* ── Profile Details ── */}
        <SectionCard
          icon={User}
          title="Profile Details"
          subtitle="Update your display name."
        >
          <form onSubmit={handleSaveProfile} noValidate>
            <div className="max-w-sm">
              <Input
                label="Full Name"
                required
                value={profileForm.full_name}
                onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                error={profileErrors.full_name}
                placeholder="Enter your full name"
              />
            </div>
            <div className="mt-4">
              <Button type="submit" loading={savingProfile} variant="primary" size="sm">
                Save Changes
              </Button>
            </div>
          </form>
        </SectionCard>

        {/* ── Change Password ── */}
        <SectionCard
          icon={Lock}
          title="Change Password"
          subtitle="Choose a strong password to keep your account secure."
        >
          <form onSubmit={handleChangePassword} noValidate>
            <div className="max-w-sm space-y-4">
              <PasswordInput
                label="Current Password"
                required
                value={pwForm.current_password}
                onChange={e => setPwForm(p => ({ ...p, current_password: e.target.value }))}
                error={pwErrors.current_password}
                placeholder="Enter current password"
              />
              <div>
                <PasswordInput
                  label="New Password"
                  required
                  value={pwForm.new_password}
                  onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                  error={pwErrors.new_password}
                  placeholder="Enter new password"
                />
                <PasswordStrength password={pwForm.new_password} />
              </div>
              <PasswordInput
                label="Confirm New Password"
                required
                value={pwForm.confirm_password}
                onChange={e => setPwForm(p => ({ ...p, confirm_password: e.target.value }))}
                error={pwErrors.confirm_password}
                placeholder="Re-enter new password"
              />
            </div>
            <div className="mt-5">
              <Button type="submit" loading={savingPw} variant="blue" size="sm">
                Change Password
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}