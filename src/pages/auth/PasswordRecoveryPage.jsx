import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import WellserveLogo from '../../components/shared/WellserveLogo';
import { requestPasswordRecovery, saveRecoveredPassword, validateRecoveryLink } from '../../services/passwordRecoveryService';

export default function PasswordRecoveryPage() {
  const requesting = window.location.pathname === '/forgot-password';
  const [state, setState] = useState(requesting ? 'ready' : 'checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  useEffect(() => {
    if (requesting) return;
    let mounted = true;
    validateRecoveryLink().then(valid => { if (mounted) setState(valid ? 'ready' : 'invalid'); });
    return () => { mounted = false; };
  }, [requesting]);

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    setError('');
    if (!requesting && (password.length < 15 || password !== confirmation)) {
      setError('Use at least 15 characters and matching passwords.');
      return;
    }
    busy.current = true;
    setState('saving');
    try {
      if (requesting) await requestPasswordRecovery(email);
      else await saveRecoveredPassword(password);
      setPassword('');
      setConfirmation('');
      setState('done');
    } catch (err) {
      setError(err.message);
      setState('ready');
    } finally { busy.current = false; }
  }

  const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-600';
  return <main className="min-h-screen bg-white px-5 py-12 flex items-center justify-center">
    <section className="w-full max-w-md">
      <WellserveLogo size={120} variant="dark" layout="horizontal" />
      <h1 className="mt-8 mb-6 text-2xl font-semibold text-gray-900">{requesting ? 'Reset your password' : 'Choose a new password'}</h1>
      {state === 'checking' && <p role="status" className="flex items-center gap-2 text-gray-600"><Loader2 className="animate-spin" size={20} />Checking link...</p>}
      {state === 'invalid' && <p role="alert" className="text-red-700">This link is invalid or expired. Please request a new one.</p>}
      {state === 'done' && <p role="status" className="text-emerald-800">{requesting
        ? 'If this email belongs to an account, a reset link will be sent. Check your inbox and spam folder.'
        : 'Your password has been updated. You can now sign in with your new password.'}</p>}
      {['ready', 'saving'].includes(state) && <form onSubmit={submit} className="space-y-5">
        {requesting ? <label className="block text-sm font-medium text-gray-700">Email address
          <input className={`${inputClass} mt-2`} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={state === 'saving'} />
        </label> : <>
          <label className="block text-sm font-medium text-gray-700" htmlFor="recovery-password">New password (at least 15 characters)</label>
          <div className="relative"><input id="recovery-password" className={`${inputClass} pr-12`} type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={15} value={password} onChange={e => setPassword(e.target.value)} disabled={state === 'saving'} />
            <button type="button" onClick={() => setVisible(!visible)} title={visible ? 'Hide password' : 'Show password'} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-gray-500">{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
          </div>
          <label className="block text-sm font-medium text-gray-700">Confirm password
            <input className={`${inputClass} mt-2`} type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={15} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={state === 'saving'} />
          </label>
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={state === 'saving'} className="w-full min-h-12 rounded-md bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{state === 'saving' ? 'Please wait...' : requesting ? 'Send reset link' : 'Save password'}</button>
      </form>}
      <div className="mt-6 flex flex-wrap gap-5 text-sm font-semibold text-emerald-700">
        <a href="/login">Back to login</a>
        {state === 'invalid' && <a href="/forgot-password">Request a new link</a>}
      </div>
    </section>
  </main>;
}
