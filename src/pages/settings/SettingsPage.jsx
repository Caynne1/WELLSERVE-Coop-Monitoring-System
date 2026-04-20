import { useState } from 'react';
import {
  User, Lock, Eye, EyeOff, CheckCircle2, ShieldCheck,
  Mail, BadgeCheck, Pencil, KeyRound, AlertCircle,
  Clock, Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

// ─── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name }) {
  const initials = (name || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="relative flex-shrink-0">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#07A04E] to-[#273C2C]
        flex items-center justify-center text-white text-2xl font-bold shadow-lg">
        {initials}
      </div>
      {/* Online dot */}
      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-400
        border-2 border-white shadow-sm" />
    </div>
  );
}

// ─── Role Badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const isAdmin = role === 'admin';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full
      ${isAdmin
        ? 'bg-[#07A04E]/10 text-[#07A04E] border border-[#07A04E]/20'
        : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
      <BadgeCheck size={11} />
      {role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User'}
    </span>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100
      rounded-xl px-3.5 py-2.5 min-w-0">
      <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 shadow-sm
        flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-[#07A04E]" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-400 text-[10px] leading-tight uppercase tracking-wide">{label}</p>
        <p className="text-gray-800 text-xs font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, subtitle, children, accent = 'gray' }) {
  const iconBg    = { green: 'bg-[#07A04E]/10', blue: 'bg-blue-50', gray: 'bg-gray-100' };
  const iconColor = { green: 'text-[#07A04E]',  blue: 'text-blue-600', gray: 'text-gray-500' };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3 bg-gray-50/60">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg[accent]}`}>
          <Icon size={15} className={iconColor[accent]} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ─── Read Field ────────────────────────────────────────────────────────────────
function ReadField({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100
        flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ─── Password Input ────────────────────────────────────────────────────────────
function PasswordInput({ label, required, value, onChange, error, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`px-3 py-2 pr-10 text-sm border rounded-xl w-full
            focus:outline-none focus:ring-2 focus:ring-[#07A04E]/30 focus:border-[#07A04E] transition-all
            ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
            hover:text-gray-600 transition-colors">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle size={11} className="flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

// ─── Password Strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Uppercase letter',       pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter',       pass: /[a-z]/.test(password) },
    { label: 'Number or symbol',       pass: /[0-9!@#$%^&*]/.test(password) },
  ];
  const score = checks.filter(c => c.pass).length;
  const bars  = ['bg-red-400','bg-orange-400','bg-yellow-400','bg-[#07A04E]'];
  const lbls  = ['Weak','Fair','Good','Strong'];
  const txts  = ['text-red-500','text-orange-500','text-yellow-600','text-[#07A04E]'];
  return (
    <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[0,1,2,3].map(i => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300
              ${i < score ? bars[score-1] : 'bg-gray-200'}`} />
          ))}
        </div>
        {score > 0 && (
          <span className={`text-xs font-semibold ${txts[score-1]}`}>{lbls[score-1]}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {checks.map(c => (
          <div key={c.label} className="flex items-center gap-1.5">
            <CheckCircle2 size={11}
              className={`flex-shrink-0 ${c.pass ? 'text-[#07A04E]' : 'text-gray-300'}`} />
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

  const [profileForm, setProfileForm]   = useState({ full_name: profile?.full_name ?? '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  const [pwForm, setPwForm]   = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [savingPw, setSavingPw] = useState(false);

  async function handleSaveProfile(e) {
    e.preventDefault();
    const errors = {};
    if (!profileForm.full_name.trim()) errors.full_name = 'Full name is required.';
    if (Object.keys(errors).length) { setProfileErrors(errors); return; }
    setProfileErrors({});
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({ full_name: profileForm.full_name.trim() }).eq('id', user.id);
      if (error) throw error;
      toast.success('Profile updated successfully.');
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      toast.error(err.message ?? 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email, password: pwForm.current_password,
      });
      if (signInError) { setPwErrors({ current_password: 'Current password is incorrect.' }); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: pwForm.new_password });
      if (updateError) throw updateError;
      toast.success('Password changed successfully.');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err.message ?? 'Failed to change password.');
    } finally {
      setSavingPw(false);
    }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  const userId = user?.id ? user.id.slice(0, 8).toUpperCase() : null;

  return (
    <div className="p-6">

      {/* ── Page Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Account Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and security preferences.</p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

        {/* ══ LEFT COLUMN (3/5) ══════════════════════════════════════════════ */}
        <div className="lg:col-span-3 space-y-5">

          {/* Profile Banner */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Top accent strip */}
            <div className="h-1.5 bg-gradient-to-r from-[#07A04E] via-[#7EB751] to-[#273C2C]" />

            <div className="p-6">
              {/* Avatar + name row */}
              <div className="flex items-center gap-5">
                <Avatar name={profile?.full_name || user?.email} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="text-xl font-bold text-gray-900 leading-tight truncate">
                      {profile?.full_name || 'Set your name →'}
                    </h2>
                  </div>
                  <p className="text-gray-500 text-sm truncate mb-2.5">{user?.email}</p>
                  <RoleBadge role={profile?.role} />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100 my-4" />

              {/* Stat pills row */}
              <div className="grid grid-cols-3 gap-3">
                {memberSince && (
                  <StatPill icon={Clock} label="Member since" value={memberSince} />
                )}
                {lastSignIn && (
                  <StatPill icon={Clock} label="Last sign in" value={lastSignIn} />
                )}
                {userId && (
                  <StatPill icon={Hash} label="User ID" value={userId} />
                )}
              </div>
            </div>
          </div>

          {/* Account Information */}
          <SectionCard
            icon={ShieldCheck}
            title="Account Information"
            subtitle="Your credentials on record — read only."
            accent="gray"
          >
            <ReadField icon={Mail} label="Email Address">
              <p className="text-sm font-medium text-gray-800">{user?.email ?? '—'}</p>
            </ReadField>
            <ReadField icon={ShieldCheck} label="Account Role">
              <RoleBadge role={profile?.role} />
            </ReadField>
            <ReadField icon={BadgeCheck} label="Account Status">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold
                px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active
              </span>
            </ReadField>
            <div className="mt-3 pt-3 border-t border-gray-50 flex items-start gap-2">
              <AlertCircle size={12} className="text-gray-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400">
                Email and role cannot be changed here. Contact the administrator if updates are needed.
              </p>
            </div>
          </SectionCard>

          {/* Profile Details */}
          <SectionCard
            icon={Pencil}
            title="Profile Details"
            subtitle="Update your display name across the system."
            accent="green"
          >
            <form onSubmit={handleSaveProfile} noValidate>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2
                    text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))}
                    placeholder="Enter your full name"
                    className={`pl-9 pr-3 py-2 text-sm border rounded-xl w-full
                      focus:outline-none focus:ring-2 focus:ring-[#07A04E]/30 focus:border-[#07A04E]
                      transition-all
                      ${profileErrors.full_name
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  />
                </div>
                {profileErrors.full_name && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle size={11} className="flex-shrink-0" /> {profileErrors.full_name}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button type="submit" loading={savingProfile} variant="primary" size="sm">
                  Save Changes
                </Button>
                {profileSaved && (
                  <span className="flex items-center gap-1.5 text-xs text-[#07A04E] font-semibold">
                    <CheckCircle2 size={13} /> Saved!
                  </span>
                )}
              </div>
            </form>
          </SectionCard>

        </div>

        {/* ══ RIGHT COLUMN (2/5) — sticky ════════════════════════════════════ */}
        <div className="lg:col-span-2 lg:sticky lg:top-6">
          <SectionCard
            icon={KeyRound}
            title="Change Password"
            subtitle="Keep your account secure with a strong password."
            accent="blue"
          >
            <form onSubmit={handleChangePassword} noValidate>
              <div className="space-y-4">
                <PasswordInput
                  label="Current Password"
                  required
                  value={pwForm.current_password}
                  onChange={e => setPwForm(p => ({ ...p, current_password: e.target.value }))}
                  error={pwErrors.current_password}
                  placeholder="Enter current password"
                />

                {/* Divider */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-dashed border-gray-200" />
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                    New password
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-200" />
                </div>

                <div>
                  <PasswordInput
                    label="New Password"
                    required
                    value={pwForm.new_password}
                    onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                    error={pwErrors.new_password}
                    placeholder="Create a new password"
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

              <div className="mt-5 pt-4 border-t border-gray-100">
                <Button type="submit" loading={savingPw} variant="blue" size="sm"
                  icon={<Lock size={13} />} className="w-full justify-center">
                  Change Password
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* Security tip card */}
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldCheck size={13} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-1">Security tip</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Use a unique password with a mix of letters, numbers, and symbols.
                  Never reuse passwords from other accounts.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}