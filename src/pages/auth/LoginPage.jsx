import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import { Mail, Lock, Loader2, ShieldCheck, Eye, EyeOff, Music2, Pause } from 'lucide-react';
import WellserveLogo from '../../components/shared/WellserveLogo';
import SplashScreen from '../../components/shared/SplashScreen';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [jinglePlaying, setJinglePlaying] = useState(false);
  const audioRef = useRef(null);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const [splashVisible, setSplashVisible] = useState(true);
  const [splashExiting, setSplashExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setSplashExiting(true), 2600);
    return () => clearTimeout(exitTimer);
  }, []);

  useEffect(() => () => audioRef.current?.pause(), []);

  function handleSplashDone() {
    setSplashVisible(false);
  }

  async function toggleJingle() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setJinglePlaying(true);
      } catch {
        toast.error('The WELLSERVE jingle could not be played.');
      }
      return;
    }

    audio.pause();
    setJinglePlaying(false);
  }

  async function onSubmit({ email, password }) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    audioRef.current?.pause();
    setJinglePlaying(false);
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
            <div className="ws-left-content">

              <div className="ws-brand-header">
                <WellserveLogo size={150} variant="light" layout="horizontal" />
              </div>

              <div className="ws-hero">
                <h1 className="ws-portal-title">Operations Portal</h1>
                <p className="ws-portal-desc">
                  A secure workspace for managing cooperative operations, services, finances, and reports.
                </p>
                <p className="ws-access-note">
                  Built for administrators, managers, auditors, and authorized cooperative personnel.
                </p>
                <div className="ws-accent-line" aria-hidden="true" />
              </div>

            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="ws-right">
            <div className="ws-form-container">
              <audio
                ref={audioRef}
                preload="metadata"
                onEnded={() => setJinglePlaying(false)}
                onPause={() => setJinglePlaying(false)}
              >
                <source src="/wellserve-jingle.m4a" type="audio/mp4" />
              </audio>
              <button
                type="button"
                className={`ws-jingle-btn${jinglePlaying ? ' is-playing' : ''}`}
                onClick={toggleJingle}
                aria-label={jinglePlaying ? 'Pause WELLSERVE jingle' : 'Play WELLSERVE jingle'}
                aria-pressed={jinglePlaying}
                title={jinglePlaying ? 'Pause WELLSERVE jingle' : 'Play WELLSERVE jingle'}
              >
                {jinglePlaying ? <Pause size={18} /> : <Music2 size={18} />}
              </button>
              <div className="ws-form-header">
                <div className="ws-mobile-brand">
                  <WellserveLogo size={96} variant="dark" layout="horizontal" />
                </div>

                <div className="ws-lock-mark" aria-hidden="true"><Lock size={24} /></div>
                <h2 className="ws-form-title">Personnel Login</h2>
                <p className="ws-form-subtitle">Enter your credentials to access the system.</p>
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
                <ShieldCheck size={16} /> For authorized WELLSERVE personnel only.
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
            grid-template-columns: minmax(420px, 0.95fr) minmax(520px, 1.05fr);
            width: 100vw;
            height: 100vh;
            height: 100dvh;
          }

          /* LEFT PANEL */
          .ws-left {
            background: #000066;
            color: white;
            padding: 64px clamp(48px, 6vw, 96px);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
          }

          .ws-left-content {
            width: 100%;
            max-width: 520px;
            text-align: left;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 36px;
            position: relative;
            z-index: 2;
          }

          .ws-brand-header {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            width: 100%;
          }

          .ws-portal-title {
            font-family: 'Raleway', 'Inter', sans-serif;
            max-width: 500px;
            margin: 0;
            font-size: clamp(32px, 3vw, 44px);
            font-weight: 800;
            line-height: 1.12;
            letter-spacing: 0;
          }

          .ws-portal-desc {
            max-width: 450px;
            margin: 20px 0 0;
            font-size: 17px;
            line-height: 1.7;
            color: rgba(255, 255, 255, 0.82);
          }

          .ws-access-note {
            max-width: 450px;
            margin: 14px 0 0;
            font-size: 14px;
            line-height: 1.65;
            color: rgba(255, 255, 255, 0.62);
          }

          .ws-accent-line {
            width: 72px;
            height: 4px;
            margin-top: 24px;
            background: #07A04E;
          }

          /* RIGHT PANEL */
          .ws-right {
            background: #f5f7fb;
            padding: 48px clamp(32px, 7vw, 112px);
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
          }

          .ws-form-container {
            position: relative;
            width: 100%;
            max-width: 520px;
            margin: 0 auto;
            padding: clamp(36px, 5vw, 64px);
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.10);
          }

          .ws-jingle-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #000066;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 50%;
            cursor: pointer;
            transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
          }

          .ws-jingle-btn:hover,
          .ws-jingle-btn.is-playing {
            color: #07A04E;
            background: #D6FADC;
            border-color: #7EB751;
          }

          .ws-jingle-btn:focus-visible {
            outline: 3px solid rgba(7, 160, 78, 0.2);
            outline-offset: 2px;
          }

          .ws-mobile-brand {
            display: none;
            align-items: center;
            justify-content: center;
            margin-bottom: 24px;
          }

          .ws-form-header {
            text-align: center;
          }

          .ws-lock-mark {
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #000066;
            background: #eef2ff;
            border: 1px solid #cbd5e1;
            border-radius: 50%;
          }

          .ws-form-title {
            font-family: 'Raleway', 'Inter', sans-serif;
            margin: 0;
            font-size: 32px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0;
          }

          .ws-form-subtitle {
            color: #64748b;
            margin: 8px 0 0;
            line-height: 1.5;
          }

          .ws-form {
            margin-top: 36px;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }

          .ws-label {
            display: inline-block;
            margin-bottom: 8px;
            font-size: 13px;
            font-weight: 700;
            color: #374151;
            letter-spacing: 0;
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
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 15px;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .ws-input:focus {
            border-color: #07A04E;
            box-shadow: 0 0 0 3px rgba(7, 160, 78, 0.12);
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
            height: 54px;
            background: #07A04E;
            color: white;
            font-size: 16px;
            font-weight: 700;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-shadow: 0 5px 14px rgba(7, 160, 78, 0.18);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .ws-btn-primary:hover:not(:disabled) {
            transform: translateY(-1px);
            background: #078C46;
            box-shadow: 0 7px 18px rgba(7, 160, 78, 0.22);
          }

          .ws-secure-notice {
            margin-top: 28px;
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
            .ws-root {
              overflow-x: hidden;
              overflow-y: auto;
            }
            .ws-shell {
              grid-template-columns: minmax(0, 1fr);
              width: 100%;
              height: auto;
              min-height: 100vh;
              min-height: 100dvh;
            }
            .ws-left { display: none; }
            .ws-mobile-brand { display: flex; }
            .ws-right {
              min-height: 100vh;
              min-height: 100dvh;
              padding: 32px;
            }
          }

          @media (max-width: 480px) {
            .ws-right {
              align-items: center;
              padding: 18px;
            }
            .ws-form-container {
              padding: 28px 20px;
              box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
            }
            .ws-mobile-brand {
              margin-bottom: 28px;
            }
            .ws-lock-mark { width: 56px; height: 56px; margin-bottom: 16px; }
            .ws-form-title { font-size: 27px; }
            .ws-form {
              margin-top: 32px;
              gap: 20px;
            }
            .ws-input {
              min-height: 52px;
              font-size: 16px;
            }
            .ws-btn-primary {
              height: 52px;
            }
            .ws-secure-notice {
              margin-top: 24px;
            }
          }

          @media (max-width: 900px) and (max-height: 600px) {
            .ws-right {
              align-items: flex-start;
              padding-top: 24px;
              padding-bottom: 24px;
            }
            .ws-mobile-brand {
              margin-bottom: 20px;
            }
            .ws-form {
              margin-top: 24px;
              gap: 16px;
            }
            .ws-secure-notice {
              margin-top: 18px;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .ws-btn-primary { transition: none; }
          }
        `}</style>
      </div>
    </>
  );
}
