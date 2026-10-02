import { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, CheckCircle2, Circle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { trackActivity } from '../../services/logService';

const ROLES = { admin: 'Administrator', manager: 'General Manager', staff: 'Staff', accountant: 'Treasurer', auditor: 'Auditor', credit_committee: 'Credit Committee', committee: 'Committee', board_director: 'Board of Director', chairman: 'Chairman', vice_chairman: 'Vice Chairman', bookkeeper: 'Bookkeeper' };
const EMPTY = { current: '', next: '', confirm: '' };
const RULES = [
  ['At least 8 characters', value => value.length >= 8],
  ['Uppercase letter', value => /[A-Z]/.test(value)],
  ['Lowercase letter', value => /[a-z]/.test(value)],
  ['Number or symbol', value => /[0-9]|[^a-zA-Z0-9\s]/.test(value)],
];
function dateLabel(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not available';
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function PasswordField({ name, label, value, onChange, error, disabled }) {
  const [visible, setVisible] = useState(false);
  return <div>
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
    <div className="relative">
      <input id={name} type={visible ? 'text' : 'password'} value={value} onChange={onChange} disabled={disabled}
        required autoComplete={name === 'current' ? 'current-password' : 'new-password'}
        aria-invalid={Boolean(error)} aria-describedby={error ? name + '-error' : undefined}
        className={'h-11 w-full rounded-lg border bg-white px-3 pr-11 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 disabled:bg-gray-50 ' + (error ? 'border-red-400' : 'border-gray-300')} />
      <button type="button" onClick={() => setVisible(v => !v)} title={(visible ? 'Hide ' : 'Show ') + label}
        aria-label={(visible ? 'Hide ' : 'Show ') + label} aria-pressed={visible}
        className="absolute right-0 top-0 h-full w-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-emerald-500">
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
    {error && <p id={name + '-error'} role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
  </div>;
}
export default function SettingsPage() {
  const { user, profile } = useAuth();
  const [password, setPassword] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const status = profile?.status || 'unknown';
  const details = [
    ['Role', ROLES[profile?.role] || profile?.role || 'Not assigned'],
    ['Cooperative position', profile?.position_title || 'Not assigned'],
    ['Account created', dateLabel(user?.created_at)],
    ['Last sign-in', dateLabel(user?.last_sign_in_at)],
  ];
  async function changePassword(event) {
    event.preventDefault();
    if (saving || !user?.email) return;
    const nextErrors = {};
    if (!password.current) nextErrors.current = 'Enter your current password.';
    if (!RULES.every(([, test]) => test(password.next))) nextErrors.next = 'Meet all password requirements below.';
    else if (password.next === password.current) nextErrors.next = 'Choose a different password from your current one.';
    if (!password.confirm || password.next !== password.confirm) nextErrors.confirm = 'Passwords must match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: password.current });
      if (verifyError) {
        if (verifyError.code === 'invalid_credentials') setErrors({ current: 'Current password is incorrect.' });
        else toast.error('Unable to verify your password. Please try again.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: password.next });
      if (error) throw error;
      setPassword(EMPTY);
      setErrors({});
      toast.success('Password changed successfully.');
      // Audit metadata only; password values must never enter the log.
      try {
        await trackActivity({ userId: user.id, module: 'settings', action: 'update', description: 'Changed own account password.', recordId: user.id });
      } catch {
        toast.error('Password changed, but the activity log could not be recorded.');
      }
    } catch (error) {
      toast.error(error.message || 'Unable to change your password.');
    } finally { setSaving(false); }
  }
  return <div className="p-4 sm:p-6">
    <div className="mx-auto max-w-[1120px]">
    <PageHeader title="Account Settings" />
    <div className="mt-6 flex flex-wrap items-center gap-4 border-y border-gray-200 bg-white px-5 py-6 sm:px-7">
      <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-semibold text-emerald-800">
        {(profile?.full_name || user?.email || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-gray-900 break-words">{profile?.full_name || 'Account profile'}</h2>
        <p className="mt-1 text-sm text-gray-500 break-all">{user?.email || 'Not recorded'}</p>
      </div>
      <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize ' + (status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700')}>
        <span className={'h-1.5 w-1.5 rounded-full ' + (status === 'active' ? 'bg-emerald-500' : 'bg-gray-400')} />
        {status.replace(/_/g, ' ')}
      </span>
    </div>
    <div className="grid grid-cols-1 bg-white lg:grid-cols-[360px_minmax(0,1fr)] border-b border-gray-200">
      <section aria-labelledby="profile-title" className="min-w-0 border-b border-gray-200 px-5 py-6 sm:px-7 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} className="text-gray-400" />
          <h2 id="profile-title" className="text-sm font-semibold text-gray-900">Account details</h2>
        </div>
        <dl className="mt-5 space-y-5">{details.map(([label, value]) =>
          <div key={label}>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="mt-1 text-sm font-medium text-gray-800 break-words min-w-0">{value}</dd>
          </div>)}</dl>
      </section>
      <section aria-labelledby="security-title" className="min-w-0 px-5 py-6 sm:px-8">
        <div className="flex items-center gap-2">
          <KeyRound size={17} className="text-gray-400" />
          <h2 id="security-title" className="text-sm font-semibold text-gray-900">Change password</h2>
        </div>
        <form onSubmit={changePassword} noValidate className="max-w-[480px] space-y-5 pt-5">
          {['current', 'next', 'confirm'].map((name, index) => <div key={name} className="space-y-3">
            <PasswordField name={name} label={['Current password', 'New password', 'Confirm new password'][index]}
              value={password[name]} onChange={e => setPassword(p => ({ ...p, [name]: e.target.value }))} error={errors[name]} disabled={saving} />
            {name === 'next' && <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">{RULES.map(([label, test]) =>
              <li key={label} className={'flex items-center gap-2 text-xs ' + (test(password.next) ? 'text-emerald-700' : 'text-gray-500')}>
                {test(password.next) ? <CheckCircle2 size={13} className="shrink-0" aria-label="Met" /> : <Circle size={13} className="shrink-0 text-gray-300" aria-label="Not met" />}
                {label}
              </li>)}</ul>}
          </div>)}
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
            <Button type="submit" loading={saving} disabled={!user?.email} icon={<KeyRound size={16} />}>Change Password</Button>
            <Button type="button" variant="ghost" disabled={saving} icon={<RotateCcw size={14} />} onClick={() => { setPassword(EMPTY); setErrors({}); }}>Reset</Button>
          </div>
        </form>
      </section>
    </div>
    </div>
  </div>;
}
