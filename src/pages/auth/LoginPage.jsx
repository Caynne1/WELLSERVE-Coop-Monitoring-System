import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '../../services/supabase';
import toast from 'react-hot-toast';
import { Mail, Lock, Loader2 } from 'lucide-react';
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

  // ── Inline style tokens ──────────────────────────────────────
  const S = {
    // Root
    root: {
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    },

    // Gradient background — dark premium cooperative feel
    // #273C2C (brand dark green) → #002C5F (brand deep blue)
    // No image, pure CSS gradient
    gradientBg: {
      position: 'absolute',
      inset: 0,
      background: `
        radial-gradient(ellipse 80% 70% at 15% 20%,  rgba(7,160,78,0.12)  0%, transparent 55%),
        radial-gradient(ellipse 60% 50% at 85% 80%,  rgba(0,44,95,0.30)   0%, transparent 55%),
        linear-gradient(145deg, #1a2e1e 0%, #273C2C 35%, #1c2e40 70%, #002C5F 100%)
      `,
    },

    // Subtle noise-like grain overlay for texture
    grainOverlay: {
      position: 'absolute',
      inset: 0,
      opacity: 0.025,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'repeat',
      backgroundSize: '200px 200px',
      pointerEvents: 'none',
    },

    // Watermark container — perfectly centered, behind card
    watermarkWrap: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      opacity: 0.055,
      pointerEvents: 'none',
      userSelect: 'none',
      filter: 'blur(1px)',
      zIndex: 1,
    },

    // Card wrapper
    cardWrap: {
      position: 'relative',
      zIndex: 10,
      width: '100%',
      maxWidth: '380px',
      margin: '0 16px',
    },

    // Glassmorphism card
    card: {
      background: 'rgba(255,255,255,0.09)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '24px',
      boxShadow: `
        0 32px 80px rgba(0,0,0,0.55),
        0 2px 12px rgba(7,160,78,0.12),
        inset 0 1px 0 rgba(255,255,255,0.10)
      `,
      padding: '40px 36px 32px',
    },

    // Brand section inside card
    brandSection: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: '30px',
    },
    logoWrap: {
      marginBottom: '16px',
      filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.30))',
    },
    brandTitle: {
      fontSize: '24px',
      fontWeight: '900',
      color: '#ffffff',
      letterSpacing: '5px',
      margin: 0,
      lineHeight: 1,
      textTransform: 'uppercase',
    },
    brandSub: {
      fontSize: '10px',
      color: 'rgba(255,255,255,0.42)',
      marginTop: '7px',
      letterSpacing: '2.4px',
      textTransform: 'uppercase',
      fontWeight: '600',
    },

    // Divider
    divider: {
      height: '1px',
      background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.12), transparent)',
      marginBottom: '26px',
    },

    // Field label
    label: {
      display: 'block',
      fontSize: '10px',
      fontWeight: '700',
      color: 'rgba(255,255,255,0.55)',
      letterSpacing: '1.6px',
      textTransform: 'uppercase',
      marginBottom: '8px',
    },

    // Input wrapper
    inputWrap: { position: 'relative' },

    // Input — semi-solid white for readability, dark text
    input: (hasError) => ({
      width: '100%',
      boxSizing: 'border-box',
      paddingLeft: '40px',
      paddingRight: '14px',
      paddingTop: '11px',
      paddingBottom: '11px',
      fontSize: '13.5px',
      color: '#1a2e1e',              // dark readable text on white bg
      fontWeight: '500',
      background: 'rgba(255,255,255,0.88)',   // semi-solid white
      border: hasError
        ? '1.5px solid rgba(255,100,100,0.80)'
        : '1.5px solid rgba(255,255,255,0.20)',
      borderRadius: '12px',
      outline: 'none',
      transition: 'border 0.18s, box-shadow 0.18s',
    }),

    // Input icon
    inputIcon: {
      position: 'absolute',
      left: '13px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#07A04E',
      pointerEvents: 'none',
      display: 'flex',
    },

    // Error text
    errorText: {
      fontSize: '11px',
      color: '#fca5a5',
      marginTop: '6px',
    },

    // Sign In button
    signInBtn: (isLoading) => ({
      width: '100%',
      padding: '13px',
      borderRadius: '12px',
      fontSize: '13.5px',
      fontWeight: '700',
      color: '#ffffff',
      background: '#07A04E',
      border: 'none',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      opacity: isLoading ? 0.70 : 1,
      boxShadow: '0 4px 20px rgba(7,160,78,0.42)',
      transition: 'background 0.18s, box-shadow 0.18s, transform 0.12s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      letterSpacing: '0.8px',
    }),

    // Footer text
    footer: {
      textAlign: 'center',
      fontSize: '10px',
      color: 'rgba(255,255,255,0.18)',
      marginTop: '24px',
      letterSpacing: '0.8px',
    },
  };

  return (
    <div style={S.root}>

      {/* ── 1. Gradient background — no image ── */}
      <div style={S.gradientBg} />

      {/* ── 2. Subtle grain texture for depth ── */}
      <div style={S.grainOverlay} />

      {/* ── 3. Large faint logo watermark — behind card ── */}
      {/* No custom variant needed — parent div controls opacity and blur */}
      <div style={S.watermarkWrap}>
        <WellserveLogo size={520} variant="dark" />
      </div>

      {/* ── 4. Glass card ── */}
      <div style={S.cardWrap}>
        <div style={S.card}>

          {/* Brand */}
          <div style={S.brandSection}>
            <div style={S.logoWrap}>
              <WellserveLogo size={84} variant="light" />
            </div>
            <h1 style={S.brandTitle}>WELLSERVE</h1>
            <p style={S.brandSub}>Member Monitoring System</p>
          </div>

          {/* Divider */}
          <div style={S.divider} />

          {/* Form — logic unchanged */}
          <form onSubmit={handleSubmit(onSubmit)}>

            {/* Email field */}
            <div style={{ marginBottom: '16px' }}>
              <label style={S.label}>Email Address</label>
              <div style={S.inputWrap}>
                <span style={S.inputIcon}>
                  <Mail size={14} />
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

            {/* Password field */}
            <div style={{ marginBottom: '26px' }}>
              <label style={S.label}>Password</label>
              <div style={S.inputWrap}>
                <span style={S.inputIcon}>
                  <Lock size={14} />
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

            {/* Sign In button — logic unchanged */}
            <button
              type="submit"
              disabled={loading}
              className="ws-btn"
              style={S.signInBtn(loading)}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="ws-spin" />
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <p style={S.footer}>
            WELLSERVE Credit Cooperative · Secure Access
          </p>
        </div>
      </div>

      {/* ── Scoped CSS — focus / hover / spinner only ── */}
      <style>{`
        .ws-input:focus {
          border: 1.5px solid #07A04E !important;
          box-shadow: 0 0 0 3px rgba(7,160,78,0.18) !important;
        }
        .ws-input::placeholder {
          color: rgba(39,60,44,0.35);
        }
        .ws-btn:not(:disabled):hover {
          background: #059245 !important;
          box-shadow: 0 6px 26px rgba(7,160,78,0.52) !important;
          transform: translateY(-1px);
        }
        .ws-btn:not(:disabled):active {
          background: #047535 !important;
          box-shadow: 0 2px 10px rgba(7,160,78,0.35) !important;
          transform: translateY(0);
        }
        @keyframes ws-spin { to { transform: rotate(360deg); } }
        .ws-spin { animation: ws-spin 0.85s linear infinite; }
      `}</style>
    </div>
  );
}