import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import { Mail, Lock, Loader2, ShieldCheck } from 'lucide-react';
import WellserveLogo from '../../components/shared/WellserveLogo';

// ────────────────────────────────────────────────────────────────
//  Auth logic is COMPLETELY UNCHANGED.
//  Only the visual presentation below this line is modified.
// ────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  async function onSubmit({ email, password }) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate('/');
  }

  const S = {
    root: {
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: '32px 18px',
      fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
      background: '#f8fafc',
    },

    bgLayer: {
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(circle at 12% 18%, rgba(16,185,129,0.09) 0%, transparent 32%),
        radial-gradient(circle at 85% 15%, rgba(6,95,70,0.08) 0%, transparent 28%),
        radial-gradient(circle at 78% 82%, rgba(59,130,246,0.06) 0%, transparent 26%),
        linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)
      `,
    },

    meshOne: {
      position: 'absolute',
      width: '420px',
      height: '420px',
      borderRadius: '9999px',
      top: '-120px',
      left: '-100px',
      background: 'rgba(16,185,129,0.08)',
      filter: 'blur(70px)',
      pointerEvents: 'none',
    },

    meshTwo: {
      position: 'absolute',
      width: '360px',
      height: '360px',
      borderRadius: '9999px',
      bottom: '-120px',
      right: '-80px',
      background: 'rgba(14,165,233,0.07)',
      filter: 'blur(80px)',
      pointerEvents: 'none',
    },

    watermarkWrap: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      opacity: 0.035,
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: 1,
    },

    shell: {
      position: 'relative',
      zIndex: 10,
      width: '100%',
      maxWidth: '960px',
      display: 'grid',
      gridTemplateColumns: '1.05fr 0.95fr',
      borderRadius: '28px',
      overflow: 'hidden',
      border: '1px solid rgba(226,232,240,0.9)',
      background: 'rgba(255,255,255,0.84)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      boxShadow: '0 24px 70px rgba(15,23,42,0.12)',
    },

    leftPanel: {
      position: 'relative',
      padding: '56px 48px',
      background: `
        linear-gradient(145deg, rgba(255,255,255,0.84) 0%, rgba(248,250,252,0.94) 100%)
      `,
      borderRight: '1px solid rgba(226,232,240,0.9)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight: '620px',
    },

    rightPanel: {
      padding: '56px 48px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      background: 'rgba(255,255,255,0.72)',
      minHeight: '620px',
    },

    brandRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      marginBottom: '28px',
    },

    brandWordmark: {
      display: 'flex',
      flexDirection: 'column',
      lineHeight: 1.05,
    },

    brandTitle: {
      margin: 0,
      fontSize: '20px',
      fontWeight: '800',
      letterSpacing: '0.14em',
      color: '#0f172a',
    },

    brandSub: {
      margin: '6px 0 0',
      fontSize: '10px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.16em',
      color: '#059669',
    },

    eyebrow: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      alignSelf: 'flex-start',
      padding: '8px 12px',
      borderRadius: '9999px',
      background: '#ecfdf5',
      color: '#065f46',
      border: '1px solid #d1fae5',
      fontSize: '12px',
      fontWeight: '700',
      marginBottom: '18px',
    },

    heroTitle: {
      margin: 0,
      fontSize: '38px',
      fontWeight: '700',
      letterSpacing: '-0.03em',
      lineHeight: 1.08,
      color: '#0f172a',
      maxWidth: '420px',
    },

    heroText: {
      marginTop: '16px',
      marginBottom: 0,
      fontSize: '15px',
      lineHeight: 1.7,
      color: '#64748b',
      maxWidth: '430px',
    },

    featureGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '14px',
      marginTop: '34px',
      maxWidth: '420px',
    },

    featureCard: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '14px 16px',
      borderRadius: '18px',
      background: 'rgba(255,255,255,0.88)',
      border: '1px solid #e2e8f0',
      boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
    },

    featureIcon: {
      width: '36px',
      height: '36px',
      flexShrink: 0,
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ecfdf5',
      color: '#059669',
    },

    featureTitle: {
      margin: 0,
      fontSize: '13px',
      fontWeight: '700',
      color: '#0f172a',
    },

    featureText: {
      margin: '4px 0 0',
      fontSize: '12px',
      lineHeight: 1.55,
      color: '#64748b',
    },

    leftFooter: {
      marginTop: '28px',
      fontSize: '12px',
      color: '#94a3b8',
      lineHeight: 1.6,
    },

    formWrap: {
      width: '100%',
      maxWidth: '380px',
      margin: '0 auto',
    },

    formCard: {
      padding: '0',
    },

    formEyebrow: {
      margin: 0,
      fontSize: '12px',
      fontWeight: '700',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#059669',
    },

    formTitle: {
      margin: '10px 0 0',
      fontSize: '30px',
      fontWeight: '700',
      letterSpacing: '-0.03em',
      color: '#0f172a',
    },

    formText: {
      margin: '10px 0 0',
      fontSize: '14px',
      lineHeight: 1.65,
      color: '#64748b',
    },

    formDivider: {
      height: '1px',
      background: '#e2e8f0',
      margin: '26px 0 24px',
    },

    label: {
      display: 'block',
      fontSize: '11px',
      fontWeight: '700',
      color: '#64748b',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: '8px',
    },

    inputWrap: {
      position: 'relative',
    },

    input: (hasError) => ({
      width: '100%',
      boxSizing: 'border-box',
      paddingLeft: '42px',
      paddingRight: '14px',
      paddingTop: '13px',
      paddingBottom: '13px',
      borderRadius: '14px',
      border: hasError ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
      background: '#ffffff',
      color: '#0f172a',
      fontSize: '14px',
      fontWeight: '500',
      outline: 'none',
      transition: 'border-color 0.18s, box-shadow 0.18s, transform 0.18s',
      boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
    }),

    inputIcon: {
      position: 'absolute',
      left: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#94a3b8',
      display: 'flex',
      pointerEvents: 'none',
    },

    errorText: {
      fontSize: '11px',
      color: '#dc2626',
      marginTop: '7px',
      fontWeight: '500',
    },

    signInBtn: (isLoading) => ({
      width: '100%',
      padding: '13px 16px',
      borderRadius: '14px',
      border: 'none',
      background: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '700',
      letterSpacing: '0.02em',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      opacity: isLoading ? 0.72 : 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      boxShadow: '0 10px 24px rgba(5,150,105,0.22)',
      transition: 'transform 0.16s, box-shadow 0.16s, filter 0.16s',
      marginTop: '4px',
    }),

    secureNote: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      marginTop: '16px',
      fontSize: '12px',
      color: '#64748b',
    },

    footer: {
      textAlign: 'center',
      fontSize: '11px',
      color: '#94a3b8',
      marginTop: '28px',
      lineHeight: 1.6,
    },

    mobileLogoWrap: {
      display: 'none',
    },
  };

  return (
    <div style={S.root}>
      <div style={S.bgLayer} />
      <div style={S.meshOne} />
      <div style={S.meshTwo} />

      <div style={S.watermarkWrap}>
        <WellserveLogo size={500} variant="dark" />
      </div>

      <div style={S.shell} className="ws-shell">
        {/* Left Brand / Intro Panel */}
        <div style={S.leftPanel} className="ws-left-panel">
          <div>
            <div style={S.brandRow}>
              <WellserveLogo size={48} variant="dark" />
              <div style={S.brandWordmark}>
                <p style={S.brandTitle}>WELLSERVE</p>
                <p style={S.brandSub}>Credit Cooperative</p>
              </div>
            </div>

            <div style={S.eyebrow}>
              <ShieldCheck size={14} />
              Secure cooperative access
            </div>

            <h1 style={S.heroTitle}>
              Welcome back to your cooperative workspace
            </h1>

            <p style={S.heroText}>
              Access member records, savings, CBU, loans, and financial activity
              from one clean and secure monitoring system.
            </p>

            <div style={S.featureGrid}>
              <div style={S.featureCard}>
                <div style={S.featureIcon}>
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <p style={S.featureTitle}>Protected access</p>
                  <p style={S.featureText}>
                    Sign in securely to manage cooperative operations with confidence.
                  </p>
                </div>
              </div>

              <div style={S.featureCard}>
                <div style={S.featureIcon}>
                  <Mail size={16} />
                </div>
                <div>
                  <p style={S.featureTitle}>Organized financial records</p>
                  <p style={S.featureText}>
                    Review members, monitor balances, and keep transaction data clear and structured.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p style={S.leftFooter}>
            WELLSERVE Credit Cooperative Monitoring System
          </p>
        </div>

        {/* Right Form Panel */}
        <div style={S.rightPanel} className="ws-right-panel">
          <div style={S.formWrap}>
            <div style={S.mobileLogoWrap} className="ws-mobile-brand">
              <WellserveLogo size={56} variant="dark" />
            </div>

            <div style={S.formCard}>
              <p style={S.formEyebrow}>Administrator Login</p>
              <h2 style={S.formTitle}>Sign in</h2>
              <p style={S.formText}>
                Enter your credentials to continue to the dashboard.
              </p>

              <div style={S.formDivider} />

              <form onSubmit={handleSubmit(onSubmit)}>
                <div style={{ marginBottom: '18px' }}>
                  <label style={S.label}>Email Address</label>
                  <div style={S.inputWrap}>
                    <span style={S.inputIcon}>
                      <Mail size={16} />
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="admin@wellserve.coop"
                      {...register('email', { required: 'Email is required' })}
                      className="ws-input"
                      style={S.input(!!errors.email)}
                    />
                  </div>
                  {errors.email && <p style={S.errorText}>{errors.email.message}</p>}
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={S.label}>Password</label>
                  <div style={S.inputWrap}>
                    <span style={S.inputIcon}>
                      <Lock size={16} />
                    </span>
                    <input
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register('password', { required: 'Password is required' })}
                      className="ws-input"
                      style={S.input(!!errors.password)}
                    />
                  </div>
                  {errors.password && <p style={S.errorText}>{errors.password.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="ws-btn"
                  style={S.signInBtn(loading)}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="ws-spin" />
                      Signing in...
                    </>
                  ) : 'Sign In'}
                </button>
              </form>

              <div style={S.secureNote}>
                <ShieldCheck size={14} />
                Secure access for authorized personnel only
              </div>

              <p style={S.footer}>
                WELLSERVE Credit Cooperative · Secure Access
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .ws-input:focus {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 4px rgba(16,185,129,0.12) !important;
        }

        .ws-input::placeholder {
          color: #94a3b8;
        }

        .ws-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(5,150,105,0.26) !important;
          filter: saturate(1.03);
        }

        .ws-btn:not(:disabled):active {
          transform: translateY(0);
          box-shadow: 0 8px 18px rgba(5,150,105,0.18) !important;
        }

        @keyframes ws-spin {
          to { transform: rotate(360deg); }
        }

        .ws-spin {
          animation: ws-spin 0.85s linear infinite;
        }

        @media (max-width: 920px) {
          .ws-shell {
            grid-template-columns: 1fr !important;
            max-width: 440px !important;
          }

          .ws-left-panel {
            display: none !important;
          }

          .ws-right-panel {
            min-height: auto !important;
            padding: 36px 26px !important;
          }

          .ws-mobile-brand {
            display: flex !important;
            justify-content: center;
            margin-bottom: 20px;
          }
        }

        @media (max-width: 520px) {
          .ws-right-panel {
            padding: 30px 20px !important;
          }
        }
      `}</style>
    </div>
  );
}