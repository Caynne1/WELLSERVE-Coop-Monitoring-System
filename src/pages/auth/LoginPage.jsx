import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import { Mail, Lock, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import WellserveLogo from '../../components/shared/WellserveLogo';
import SplashScreen from '../../components/shared/SplashScreen';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const [splashVisible, setSplashVisible] = useState(true);
  const [splashExiting, setSplashExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setSplashExiting(true), 2600);
    return () => clearTimeout(exitTimer);
  }, []);

  function handleSplashDone() {
    setSplashVisible(false);
  }

  async function onSubmit({ email, password }) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate('/');
  }

  return (
    <>
      {splashVisible && (
        <SplashScreen exiting={splashExiting} onDone={handleSplashDone} />
      )}

      <div className="ws-root">
        <div className="ws-shell">

          {/* LEFT PANEL */}
          <div className="ws-left">
            {/* Subtle Grid + Floating Circles */}
            <div className="ws-animated-bg">
              {/* Grid Layer */}
              <div className="ws-grid"></div>
              
              {/* Floating Circles */}
              <div className="ws-circle ws-circle-1"></div>
              <div className="ws-circle ws-circle-2"></div>
              <div className="ws-circle ws-circle-3"></div>
              <div className="ws-circle ws-circle-4"></div>
            </div>

            <div className="ws-left-content">

              <div className="ws-brand-header">
                <WellserveLogo size={92} variant="light" />
                <div className="ws-brand-text">
                  <div className="ws-brand-name">WELLSERVE</div>
                  <div className="ws-brand-tagline">CREDIT COOPERATIVE</div>
                </div>
              </div>

              <div className="ws-hero">

                <h1 className="ws-portal-title">Administrator Portal</h1>
                
                <p className="ws-portal-desc">
                  Secure access for Administrators, General Manager, 
                  and authorized staff.
                </p>

                <div className="ws-features">
                  <ul>
                    <li>Real-time financial monitoring</li>
                    <li>Member &amp; loan management</li>
                  </ul>
                </div>
              </div>

              <div className="ws-bereso">BERESO GROUP OF COMPANIES</div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="ws-right">
            <div className="ws-form-container">
              <div className="ws-form-header">
                <div className="ws-mobile-brand">
                  <WellserveLogo size={48} variant="dark" />
                  <div>
                    <div className="ws-mobile-name">WELLSERVE</div>
                    <div className="ws-mobile-tag">COOPERATIVE</div>
                  </div>
                </div>

                <h2 className="ws-form-title">Welcome Back</h2>
                <p className="ws-form-subtitle">Sign in to continue</p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="ws-form">
                <div className="ws-field">
                  <label className="ws-label">Email Address</label>
                  <div className="ws-input-group">
                    <Mail className="ws-icon" size={19} />
                    <input
                      type="email"
                      {...register('email', { required: 'Email is required' })}
                      placeholder="admin@wellserve.coop"
                      className={`ws-input ${errors.email ? 'error' : ''}`}
                    />
                  </div>
                  {errors.email && <p className="ws-error">{errors.email.message}</p>}
                </div>

                <div className="ws-field">
                  <label className="ws-label">Password</label>
                  <div className="ws-input-group">
                    <Lock className="ws-icon" size={19} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...register('password', { required: 'Password is required' })}
                      placeholder="••••••••"
                      className={`ws-input ${errors.password ? 'error' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="ws-toggle-password"
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                  {errors.password && <p className="ws-error">{errors.password.message}</p>}
                </div>

                <button type="submit" disabled={loading} className="ws-btn-primary">
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Signing in...
                    </>
                  ) : 'Sign In'}
                </button>
              </form>

              <div className="ws-secure-notice">
                <ShieldCheck size={16} /> Authorized Personnel Only
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .ws-root {
            position: fixed;
            inset: 0;
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: 'Inter', system-ui, sans-serif;
          }

          .ws-shell {
            display: grid;
            grid-template-columns: 1fr 1fr;
            width: 100vw;
            height: 100vh;
          }

          /* LEFT PANEL */
          .ws-left {
            background: #000066;
            color: white;
            padding: 60px 70px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
          }

          .ws-animated-bg {
            position: absolute;
            inset: 0;
            overflow: hidden;
            pointer-events: none;
          }

          /* Subtle Grid */
          .ws-grid {
            position: absolute;
            inset: 0;
            background-image: 
              linear-gradient(rgba(7, 160, 78, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(7, 160, 78, 0.08) 1px, transparent 1px);
            background-size: 60px 60px;
            animation: gridMove 40s linear infinite;
            opacity: 0.6;
          }

          @keyframes gridMove {
            0% { transform: translate(0, 0); }
            100% { transform: translate(60px, 60px); }
          }

          /* Floating Circles */
          .ws-circle {
            position: absolute;
            border: 1px solid rgba(7, 160, 78, 0.25);
            border-radius: 50%;
            animation: floatCircle 35s infinite linear;
          }

          .ws-circle-1 { width: 620px; height: 620px; top: -220px; left: -180px; animation-duration: 42s; }
          .ws-circle-2 { width: 460px; height: 460px; bottom: -180px; right: -120px; animation-duration: 28s; animation-direction: reverse; }
          .ws-circle-3 { width: 320px; height: 320px; top: 25%; right: 8%; animation-duration: 48s; }
          .ws-circle-4 { width: 240px; height: 240px; bottom: 20%; left: 15%; animation-duration: 38s; }

          @keyframes floatCircle {
            0%   { transform: rotate(0deg) translate(50px, 40px) scale(1); }
            50%  { transform: rotate(180deg) translate(-60px, -50px) scale(1.12); }
            100% { transform: rotate(360deg) translate(50px, 40px) scale(1); }
          }

          .ws-left-content {
            width: 100%;
            max-width: 460px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 100%;
            justify-content: center;
            gap: 48px;
            position: relative;
            z-index: 2;
          }

          .ws-brand-header {
            display: flex;
            align-items: center;
            gap: 22px;
            justify-content: center;
          }

          .ws-brand-name {
            font-size: 36px;
            font-weight: 900;
            letter-spacing: -0.04em;
          }

          .ws-brand-tagline {
            font-size: 17px;
            font-weight: 700;
            letter-spacing: 2px;
            color: #07A04E;
          }

          .ws-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(7, 160, 78, 0.12);
            border: 1px solid rgba(7, 160, 78, 0.5);
            color: #07A04E;
            padding: 7px 18px;
            border-radius: 9999px;
            font-size: 12.5px;
            font-weight: 700;
            letter-spacing: 1.2px;
          }

          .ws-portal-title {
            font-size: 43px;
            font-weight: 800;
            line-height: 1.05;
            letter-spacing: -0.04em;
          }

          .ws-portal-desc {
            font-size: 16px;
            line-height: 1.7;
            opacity: 0.92;
            max-width: 390px;
          }

          .ws-features ul {
            margin-top: 32px;
            list-style: none;
            padding: 0;
            font-size: 15px;
            text-align: left;
            display: inline-block;
          }

          .ws-features li {
            padding: 8px 0;
            position: relative;
            padding-left: 26px;
          }

          .ws-features li::before {
            content: '•';
            position: absolute;
            left: 0;
            color: #07A04E;
            font-size: 19px;
          }

          .ws-bereso {
            font-size: 12px;
            letter-spacing: 2.8px;
            opacity: 0.7;
          }

          /* RIGHT PANEL */
          .ws-right {
            background: #ffffff;
            padding: 80px 72px;
            display: flex;
            align-items: center;
          }

          .ws-form-container {
            width: 100%;
            max-width: 380px;
            margin: 0 auto;
          }

          .ws-mobile-brand {
            display: none;
            align-items: center;
            gap: 14px;
            margin-bottom: 40px;
          }

          .ws-form-title {
            font-size: 31px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
          }

          .ws-form-subtitle {
            color: #64748b;
            margin-top: 6px;
          }

          .ws-form {
            margin-top: 48px;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }

          .ws-label {
            font-size: 13px;
            font-weight: 700;
            color: #374151;
            letter-spacing: 0.6px;
          }

          .ws-input-group {
            position: relative;
          }

          .ws-icon {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
          }

          .ws-input {
            width: 100%;
            padding: 15px 16px 15px 50px;
            border: 1.5px solid #e2e8f0;
            border-radius: 14px;
            font-size: 15px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .ws-input:focus {
            border-color: #000066;
            box-shadow: 0 0 0 4px rgba(0, 0, 102, 0.12);
            outline: none;
          }

          .ws-input.error {
            border-color: #ef4444;
          }

          .ws-toggle-password {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
          }

          .ws-error {
            color: #ef4444;
            font-size: 12.5px;
            margin-top: 4px;
          }

          .ws-btn-primary {
            height: 58px;
            background: linear-gradient(135deg, #07A04E, #036636);
            color: white;
            font-size: 16px;
            font-weight: 700;
            border: none;
            border-radius: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-shadow: 0 10px 25px rgba(7, 160, 78, 0.35);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .ws-btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 16px 32px rgba(7, 160, 78, 0.45);
          }

          .ws-secure-notice {
            margin-top: 32px;
            text-align: center;
            font-size: 13px;
            color: #64748b;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
          }

          /* Mobile */
          @media (max-width: 900px) {
            .ws-shell { grid-template-columns: 1fr; }
            .ws-left { display: none; }
            .ws-mobile-brand { display: flex; }
            .ws-right { padding: 60px 32px; }
          }
        `}</style>
      </div>
    </>
  );
}