import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
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

  const title = state === 'done' ? (requesting ? 'Check your inbox' : 'Password updated')
    : state === 'invalid' ? 'Link unavailable' : requesting ? 'Forgot password?' : 'Reset password';
  return <main className="recovery-root">
    <aside className="recovery-brand">
      <div className="recovery-brand-content">
        <WellserveLogo size={150} variant="light" layout="horizontal" />
        <div>
          <h2>Operations Portal</h2>
          <p>A secure workspace for managing cooperative operations, services, finances, and reports.</p>
          <p className="recovery-access">Built for administrators, managers, auditors, and authorized cooperative personnel.</p>
          <div className="recovery-accent" aria-hidden="true" />
        </div>
      </div>
    </aside>
    <div className="recovery-right">
    <section className="recovery-form-container" aria-labelledby="recovery-title">
      <div className="recovery-mobile-brand"><WellserveLogo size={96} variant="dark" layout="horizontal" /></div>
      <header className="recovery-heading">
        <div className="recovery-lock" aria-hidden="true">{state === 'done' ? <CheckCircle2 size={24} /> : <Lock size={24} />}</div>
        <h1 id="recovery-title">{title}</h1>
        {['ready', 'saving'].includes(state) && <p>{requesting ? 'Enter your registered email address.' : 'Choose a unique password for your account.'}</p>}
      </header>
      {state === 'checking' && <p role="status" className="recovery-status"><Loader2 className="animate-spin" size={20} />Checking link...</p>}
      {state === 'invalid' && <p role="alert" className="recovery-status recovery-error">This link is invalid or expired. Please request a new one.</p>}
      {state === 'done' && <p role="status" className="recovery-status recovery-success">{requesting
        ? 'If this email belongs to an account, a reset link will be sent. Check your inbox and spam folder.'
        : 'Your password has been updated. You can now sign in with your new password.'}</p>}
      {['ready', 'saving'].includes(state) && <form onSubmit={submit} className="recovery-form">
        {requesting ? <div>
          <label htmlFor="recovery-email">Email Address</label>
          <div className="recovery-input-group"><Mail size={19} aria-hidden="true" />
            <input id="recovery-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} disabled={state === 'saving'} />
          </div>
        </div> : <>
          <div>
            <label htmlFor="recovery-password">New Password</label>
            <div className="recovery-input-group"><Lock size={19} aria-hidden="true" />
              <input id="recovery-password" className="recovery-password" type={visible ? 'text' : 'password'} autoComplete="new-password" aria-describedby="recovery-requirements" required minLength={15} value={password} onChange={e => setPassword(e.target.value)} disabled={state === 'saving'} />
              <button type="button" onClick={() => setVisible(!visible)} title={visible ? 'Hide passwords' : 'Show passwords'} aria-label={visible ? 'Hide passwords' : 'Show passwords'} aria-pressed={visible} className="recovery-toggle">{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            </div>
            <p id="recovery-requirements" className="recovery-hint">At least 15 characters.</p>
          </div>
          <div>
            <label htmlFor="recovery-confirmation">Confirm Password</label>
            <div className="recovery-input-group"><Lock size={19} aria-hidden="true" />
              <input id="recovery-confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={15} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={state === 'saving'} />
            </div>
          </div>
        </>}
        {error && <p role="alert" className="recovery-error">{error}</p>}
        <button disabled={state === 'saving'} className="recovery-primary">{state === 'saving' && <Loader2 size={20} className="animate-spin" />}{state === 'saving' ? 'Please wait...' : requesting ? 'Send Reset Link' : 'Save Password'}</button>
      </form>}
      <nav className="recovery-links" aria-label="Account recovery">
        <a href="/login"><ArrowLeft size={16} aria-hidden="true" />Back to login</a>
        {state === 'invalid' && <a href="/forgot-password">Request a new link</a>}
      </nav>
      <p className="recovery-notice"><ShieldCheck size={16} aria-hidden="true" /><span>For authorized WELLSERVE personnel only.</span></p>
    </section>
    </div>
    <style>{`
      .recovery-root { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); font-family: 'Inter', system-ui, sans-serif; letter-spacing: 0; }
      .recovery-root * { box-sizing: border-box; }
      .recovery-brand { background: #000066; color: white; padding: 64px clamp(48px, 6vw, 96px); display: flex; align-items: center; justify-content: center; }
      .recovery-brand-content { width: 100%; max-width: 520px; display: flex; flex-direction: column; align-items: flex-start; gap: 36px; }
      .recovery-brand h2 { font-family: 'Raleway', 'Inter', sans-serif; font-size: 44px; font-weight: 800; line-height: 1.12; margin: 0; overflow-wrap: anywhere; }
      .recovery-brand p { max-width: 450px; margin: 20px 0 0; font-size: 17px; line-height: 1.7; color: rgba(255,255,255,.82); }
      .recovery-brand .recovery-access { margin-top: 14px; font-size: 14px; line-height: 1.65; color: rgba(255,255,255,.62); }
      .recovery-accent { width: 72px; height: 4px; margin-top: 24px; background: #07a04e; }
      .recovery-right { min-width: 0; background: #f5f7fb; padding: 48px clamp(32px, 7vw, 112px); display: flex; align-items: center; justify-content: center; }
      .recovery-form-container { width: 100%; max-width: 520px; padding: clamp(36px, 5vw, 64px); background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 18px 48px rgba(15,23,42,.10); }
      .recovery-mobile-brand { display: none; justify-content: center; margin-bottom: 24px; }
      .recovery-heading { text-align: center; }
      .recovery-lock { width: 64px; height: 64px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; color: #000066; background: #eef2ff; border: 1px solid #cbd5e1; border-radius: 50%; }
      .recovery-heading h1 { font-family: 'Raleway', 'Inter', sans-serif; margin: 0; font-size: 32px; font-weight: 800; color: #0f172a; overflow-wrap: anywhere; line-height: 1.2; }
      .recovery-heading p { color: #64748b; margin: 8px 0 0; line-height: 1.5; }
      .recovery-form { margin-top: 36px; display: flex; flex-direction: column; gap: 24px; }
      .recovery-form label { display: inline-block; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #374151; }
      .recovery-input-group { position: relative; }
      .recovery-input-group > svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
      .recovery-input-group input { width: 100%; min-width: 0; min-height: 54px; padding: 15px 16px 15px 50px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; }
      .recovery-input-group input.recovery-password { padding-right: 48px; }
      .recovery-input-group input:focus { border-color: #07a04e; box-shadow: 0 0 0 3px rgba(7,160,78,.12); outline: none; }
      .recovery-toggle { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 40px; height: 44px; display: flex; align-items: center; justify-content: center; color: #64748b; background: none; border: 0; cursor: pointer; }
      .recovery-hint { margin: 8px 0 0; color: #64748b; font-size: 12px; }
      .recovery-primary { min-height: 54px; padding: 12px 16px; background: #07a04e; color: white; font-size: 16px; font-weight: 700; border: 0; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 5px 14px rgba(7,160,78,.18); }
      .recovery-primary:hover:not(:disabled) { background: #078c46; }
      .recovery-primary:disabled { opacity: .6; cursor: wait; }
      .recovery-root a:focus-visible, .recovery-root button:focus-visible { outline: 3px solid #07a04e; outline-offset: 3px; }
      .recovery-status { margin: 28px 0 0; color: #64748b; line-height: 1.6; display: flex; align-items: center; gap: 10px; }
      .recovery-status svg { flex-shrink: 0; }
      .recovery-error { color: #b91c1c; font-size: 14px; }
      .recovery-success { color: #087443; }
      .recovery-links { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 16px; }
      .recovery-links a { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: #087443; text-decoration: none; }
      .recovery-links a:hover { text-decoration: underline; }
      .recovery-notice { margin: 28px 0 0; text-align: center; font-size: 13px; color: #64748b; display: flex; align-items: center; justify-content: center; gap: 7px; }
      .recovery-notice svg { flex-shrink: 0; }
      @media (max-width: 1100px) { .recovery-right { padding: 40px 28px; } .recovery-form-container { padding: 36px; } }
      @media (max-width: 900px) { .recovery-root { grid-template-columns: minmax(0, 1fr); } .recovery-brand { display: none; } .recovery-mobile-brand { display: flex; } .recovery-right { padding: 32px; } }
      @media (max-width: 480px) { .recovery-right { padding: 18px; } .recovery-form-container { padding: 28px 20px; box-shadow: 0 10px 28px rgba(15,23,42,.08); } .recovery-heading h1 { font-size: 27px; } .recovery-lock { width: 56px; height: 56px; margin-bottom: 16px; } .recovery-form { margin-top: 32px; gap: 20px; } }
      @media (prefers-reduced-motion: reduce) { .recovery-root .animate-spin { animation: none; } }
    `}</style>
  </main>;
}
