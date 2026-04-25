import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import { Mail, Lock, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import WellserveLogo from '../../components/shared/WellserveLogo';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  async function onSubmit({ email, password }) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate('/');
  }

  return (
    <div className="ws-root">
      {/* Background */}
      <div className="ws-bg" />
      <div className="ws-blob ws-blob-1" />
      <div className="ws-blob ws-blob-2" />
      <div className="ws-blob ws-blob-3" />

      <div className="ws-shell">

        {/* ══════════ LEFT PANEL ══════════ */}
        <div className="ws-left">
          <div className="ws-deco ws-deco-1" />
          <div className="ws-deco ws-deco-2" />
          <div className="ws-deco ws-deco-3" />

          <div className="ws-left-inner">
            {/* Brand */}
            <div className="ws-brand">
              <div className="ws-logo-ring">
                <WellserveLogo size={40} variant="light" />
              </div>
              <div>
                <p className="ws-brand-name">WELLSERVE</p>
                <p className="ws-brand-tagline">Credit Cooperative</p>
              </div>
            </div>

            {/* Hero */}
            <div className="ws-hero">
              <span className="ws-badge">
                <ShieldCheck size={13} />
                Secure &amp; Trusted Platform
              </span>
              <h1 className="ws-headline">
                Your Cooperative,<br />
                Fully in Control
              </h1>
              <p className="ws-sub">
                Manage members, loans, savings, CBU, and all financial activity
                from one clean, secure monitoring system built for your cooperative.
              </p>

              <div className="ws-divider" />

              <p className="ws-quote">
                "Empowering cooperatives with clarity, efficiency, and security — every transaction, every member, every day."
              </p>
            </div>

            <p className="ws-left-foot">
              © {new Date().getFullYear()} WELLSERVE Credit Cooperative. All rights reserved.
            </p>
          </div>
        </div>

        {/* ══════════ RIGHT PANEL ══════════ */}
        <div className="ws-right">
          {/* Mobile logo */}
          <div className="ws-mobile-logo">
            <div className="ws-mobile-logo-ring">
              <WellserveLogo size={36} variant="dark" />
            </div>
            <div>
              <p className="ws-mobile-brand-name">WELLSERVE</p>
              <p className="ws-mobile-brand-tag">Credit Cooperative</p>
            </div>
          </div>

          <div className="ws-form-wrap">
            <div className="ws-form-header">
              <span className="ws-form-eyebrow">
                <ShieldCheck size={12} /> Administrator Portal
              </span>
              <h2 className="ws-form-title">Welcome back</h2>
              <p className="ws-form-sub">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="ws-form">
              {/* Email */}
              <div className="ws-field">
                <label className="ws-label">Email address</label>
                <div className="ws-input-wrap">
                  <span className="ws-input-icon"><Mail size={15} /></span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="admin@wellserve.coop"
                    {...register('email', { required: 'Email is required' })}
                    className={`ws-input${errors.email ? ' ws-input-err' : ''}`}
                  />
                </div>
                {errors.email && <p className="ws-err">{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div className="ws-field">
                <label className="ws-label">Password</label>
                <div className="ws-input-wrap">
                  <span className="ws-input-icon"><Lock size={15} /></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register('password', { required: 'Password is required' })}
                    className={`ws-input${errors.password ? ' ws-input-err' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="ws-eye"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p className="ws-err">{errors.password.message}</p>}
              </div>

              <button type="submit" disabled={loading} className="ws-btn">
                {loading ? (
                  <><Loader2 size={16} className="ws-spin" /> Signing in…</>
                ) : 'Sign In'}
              </button>
            </form>

            <div className="ws-secure">
              <ShieldCheck size={13} />
              <span>Secure access · Authorized personnel only</span>
            </div>
          </div>

          <p className="ws-right-foot">WELLSERVE Credit Cooperative Monitoring System</p>
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .ws-root {
          position: relative; min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; padding: 24px 16px;
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
        }

        /* ── Background ── */
        .ws-bg {
          position: absolute; inset: 0;
          background: linear-gradient(135deg, #030d2e 0%, #0f2d6b 45%, #091d4a 100%);
        }
        .ws-blob {
          position: absolute; border-radius: 9999px;
          pointer-events: none; filter: blur(90px);
        }
        .ws-blob-1 {
          width: 520px; height: 520px; top: -160px; left: -130px;
          background: rgba(29, 78, 216, 0.50);
        }
        .ws-blob-2 {
          width: 440px; height: 440px; bottom: -150px; right: -110px;
          background: rgba(15, 44, 110, 0.60);
        }
        .ws-blob-3 {
          width: 340px; height: 340px; top: 38%; left: 36%;
          background: rgba(96, 165, 250, 0.08);
        }

        /* ── Shell ── */
        .ws-shell {
          position: relative; z-index: 10;
          width: 100%; max-width: 980px;
          display: grid; grid-template-columns: 1.1fr 0.9fr;
          border-radius: 28px; overflow: hidden;
          box-shadow: 0 32px 80px rgba(0,0,0,0.50), 0 4px 16px rgba(0,0,0,0.25);
        }

        /* ── Left panel ── */
        .ws-left {
          position: relative; overflow: hidden;
          background: linear-gradient(155deg, #0f2d6b 0%, #1e40af 55%, #2563eb 100%);
          padding: 52px 48px;
          display: flex; flex-direction: column;
          min-height: 640px;
        }

        .ws-deco {
          position: absolute; border-radius: 9999px;
          pointer-events: none; border: 1px solid rgba(255,255,255,0.07);
        }
        .ws-deco-1 { width: 360px; height: 360px; top: -110px; right: -110px; background: rgba(255,255,255,0.04); }
        .ws-deco-2 { width: 230px; height: 230px; bottom: 50px; left: -80px; background: rgba(255,255,255,0.03); }
        .ws-deco-3 { width: 150px; height: 150px; top: 50%; right: 28px; background: rgba(255,255,255,0.05); }

        .ws-left-inner {
          position: relative; z-index: 2;
          display: flex; flex-direction: column;
          height: 100%; gap: 36px;
        }

        .ws-brand { display: flex; align-items: center; gap: 14px; }
        .ws-logo-ring {
          width: 62px; height: 62px; border-radius: 18px;
          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.22);
          display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(8px);
        }
        .ws-brand-name {
          font-size: 21px; font-weight: 800; letter-spacing: 0.14em;
          color: #ffffff; line-height: 1;
        }
        .ws-brand-tagline {
          font-size: 11px; font-weight: 600; letter-spacing: 0.10em;
          text-transform: uppercase; color: rgba(255,255,255,0.60);
          margin-top: 5px;
        }

        .ws-hero { display: flex; flex-direction: column; gap: 16px; }
        .ws-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 14px; border-radius: 9999px;
          background: rgba(255,255,255,0.13);
          border: 1px solid rgba(255,255,255,0.20);
          color: rgba(255,255,255,0.92);
          font-size: 12px; font-weight: 600; width: fit-content;
        }
        .ws-headline {
          font-size: 38px; font-weight: 800;
          letter-spacing: -0.03em; line-height: 1.1;
          color: #ffffff;
        }
        .ws-sub {
          font-size: 14px; line-height: 1.72;
          color: rgba(255,255,255,0.68);
          max-width: 390px;
        }
        .ws-divider {
          width: 48px; height: 3px;
          background: rgba(255,255,255,0.28);
          border-radius: 9999px;
        }
        .ws-quote {
          font-size: 13px; line-height: 1.7;
          color: rgba(255,255,255,0.50);
          font-style: italic;
          max-width: 380px;
        }

        .ws-left-foot {
          font-size: 11px; color: rgba(255,255,255,0.35);
          margin-top: auto; padding-top: 8px;
        }

        /* ── Right panel ── */
        .ws-right {
          background: #ffffff;
          padding: 52px 48px;
          display: flex; flex-direction: column;
          justify-content: center; min-height: 640px;
        }

        .ws-mobile-logo {
          display: none; align-items: center; gap: 12px;
          justify-content: center; margin-bottom: 28px;
        }
        .ws-mobile-logo-ring {
          width: 52px; height: 52px; border-radius: 16px;
          background: #eff6ff; border: 1px solid #bfdbfe;
          display: flex; align-items: center; justify-content: center;
        }
        .ws-mobile-brand-name {
          font-size: 17px; font-weight: 800; letter-spacing: 0.12em; color: #0f172a;
        }
        .ws-mobile-brand-tag {
          font-size: 10px; font-weight: 600; color: #2563eb;
          text-transform: uppercase; letter-spacing: 0.08em; margin-top: 3px;
        }

        .ws-form-wrap { width: 100%; max-width: 360px; margin: 0 auto; }

        .ws-form-header { margin-bottom: 28px; }
        .ws-form-eyebrow {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.10em;
          text-transform: uppercase; color: #1d4ed8;
          background: #eff6ff; padding: 5px 12px; border-radius: 9999px;
          border: 1px solid #bfdbfe;
        }
        .ws-form-title {
          font-size: 30px; font-weight: 800;
          letter-spacing: -0.03em; color: #0f172a;
          margin-top: 14px;
        }
        .ws-form-sub {
          font-size: 14px; color: #64748b;
          line-height: 1.6; margin-top: 6px;
        }

        .ws-form { display: flex; flex-direction: column; gap: 18px; }
        .ws-field { display: flex; flex-direction: column; gap: 7px; }
        .ws-label {
          font-size: 12px; font-weight: 700;
          color: #374151; letter-spacing: 0.04em;
        }
        .ws-input-wrap { position: relative; }
        .ws-input-icon {
          position: absolute; left: 14px; top: 50%;
          transform: translateY(-50%);
          color: #9ca3af; display: flex; pointer-events: none;
        }
        .ws-input {
          width: 100%;
          padding: 13px 14px 13px 42px;
          border-radius: 12px;
          border: 1.5px solid #e2e8f0;
          background: #f8fafc;
          color: #0f172a; font-size: 14px; font-weight: 500;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .ws-input:focus {
          border-color: #2563eb;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(37,99,235,0.10);
        }
        .ws-input::placeholder { color: #94a3b8; }
        .ws-input-err { border-color: #fca5a5 !important; }
        .ws-eye {
          position: absolute; right: 13px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #9ca3af; display: flex; align-items: center;
          padding: 2px; transition: color 0.15s;
        }
        .ws-eye:hover { color: #374151; }
        .ws-err { font-size: 12px; color: #dc2626; font-weight: 500; }

        .ws-btn {
          width: 100%; padding: 14px;
          border-radius: 12px; border: none;
          background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
          color: #ffffff; font-size: 15px; font-weight: 700;
          letter-spacing: 0.02em; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 8px 24px rgba(37,99,235,0.30);
          transition: transform 0.16s, box-shadow 0.16s, filter 0.16s;
          margin-top: 6px;
        }
        .ws-btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(37,99,235,0.38);
          filter: saturate(1.05);
        }
        .ws-btn:not(:disabled):active {
          transform: translateY(0);
          box-shadow: 0 6px 16px rgba(37,99,235,0.22);
        }
        .ws-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        .ws-secure {
          display: flex; align-items: center; justify-content: center;
          gap: 7px; margin-top: 20px;
          font-size: 12px; color: #94a3b8;
        }

        .ws-right-foot {
          font-size: 11px; color: #cbd5e1;
          text-align: center; margin-top: 28px;
        }

        @keyframes ws-spin { to { transform: rotate(360deg); } }
        .ws-spin { animation: ws-spin 0.85s linear infinite; }

        @media (max-width: 860px) {
          .ws-shell { grid-template-columns: 1fr; max-width: 460px; }
          .ws-left { display: none; }
          .ws-right { min-height: auto; padding: 40px 32px; }
          .ws-mobile-logo { display: flex; }
        }
        @media (max-width: 500px) {
          .ws-right { padding: 32px 20px; }
        }
      `}</style>
    </div>
  );
}
