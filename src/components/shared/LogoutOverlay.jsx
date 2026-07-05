import WellserveLogo from './WellserveLogo';

/**
 * LogoutOverlay — brief animated screen shown while signing out.
 * Mirrors the SplashScreen's blue theme so login and logout feel
 * like matching bookends of the same session.
 */
export default function LogoutOverlay() {
  return (
    <div className="lo-root">
      <div className="lo-bg" />

      <div className="lo-orb lo-orb-1" />
      <div className="lo-orb lo-orb-2" />

      <div className="lo-content">
        <div className="lo-logo-wrap">
          <WellserveLogo size={72} variant="light" />
        </div>

        <p className="lo-text">Signing out&hellip;</p>

        <div className="lo-spinner" />
      </div>

      <style>{`
        .lo-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
          animation: loFadeIn 0.35s ease both;
        }

        .lo-bg {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 40% 40%, #000099 0%, #000066 40%, #00002e 100%);
        }

        .lo-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
        }
        .lo-orb-1 {
          width: 380px; height: 380px;
          background: rgba(59, 91, 219, 0.20);
          top: -100px; right: -120px;
          animation: loOrbDrift 9s ease-in-out infinite;
        }
        .lo-orb-2 {
          width: 260px; height: 260px;
          background: rgba(99, 132, 255, 0.16);
          bottom: -80px; left: -60px;
          animation: loOrbDrift 11s ease-in-out infinite reverse;
        }
        @keyframes loOrbDrift {
          0%,100% { transform: translate(0,0); }
          50%      { transform: translate(30px, 20px); }
        }

        .lo-content {
          position: relative; z-index: 10;
          display: flex; flex-direction: column;
          align-items: center; gap: 18px;
          animation: loContentUp 0.45s cubic-bezier(0.34, 1.2, 0.64, 1) both;
        }

        .lo-logo-wrap {
          animation: loLogoFade 1.8s ease-in-out infinite;
        }
        @keyframes loLogoFade {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.75; transform: scale(0.96); }
        }

        .lo-text {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          font-size: 14px; font-weight: 600;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.85);
          margin: 0;
        }

        .lo-spinner {
          width: 26px; height: 26px;
          border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.18);
          border-top-color: rgba(255,255,255,0.85);
          animation: loSpin 0.75s linear infinite;
        }
        @keyframes loSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes loFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes loContentUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
