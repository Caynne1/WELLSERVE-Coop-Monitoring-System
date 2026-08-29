import WellserveLogo from './WellserveLogo';

export default function LogoutOverlay() {
  return (
    <div className="lo-root">
      <div className="lo-content">
        <div className="lo-logo-wrap">
          <WellserveLogo size={128} variant="light" layout="horizontal" />
        </div>
        <p className="lo-text">Signing out&hellip;</p>
        <div className="lo-spinner" />
      </div>

      <style>{`
        .lo-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; background: #000066;
          animation: loFadeIn 0.25s ease both;
        }
        .lo-content {
          display: flex; flex-direction: column;
          align-items: center; gap: 20px; padding: 28px;
        }
        .lo-logo-wrap {
          width: min(82vw, 420px);
        }
        .lo-logo-wrap > div {
          width: 100% !important; max-width: 100%;
          height: auto !important; aspect-ratio: 8 / 3;
        }
        .lo-text {
          margin: 0; color: rgba(255,255,255,0.82);
          font: 600 13px/1.4 'Raleway', 'Inter', sans-serif;
          letter-spacing: 0.06em;
        }
        .lo-spinner {
          width: 25px; height: 25px; border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.22);
          border-top-color: #07A04E;
          animation: loSpin 0.75s linear infinite;
        }
        @keyframes loSpin { to { transform: rotate(360deg); } }
        @keyframes loFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
