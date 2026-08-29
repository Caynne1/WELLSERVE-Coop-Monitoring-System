import WellserveLogo from './WellserveLogo';

export default function SplashScreen({ onDone, exiting }) {
  return (
    <div className={`sp-root${exiting ? ' sp-exit' : ''}`} onAnimationEnd={exiting ? onDone : undefined}>
      <div className="sp-content">
        <div className="sp-logo-wrap">
          <WellserveLogo size={128} variant="light" layout="horizontal" />
        </div>
        <p className="sp-tagline">Credit Cooperative Monitoring System</p>
        <div className="sp-bar-wrap"><div className="sp-bar" /></div>
      </div>

      <style>{`
        .sp-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; background: #000066;
        }
        .sp-content {
          display: flex; flex-direction: column;
          align-items: center; gap: 22px;
          padding: 28px; text-align: center;
        }
        .sp-logo-wrap {
          width: min(82vw, 420px);
          animation: logoReveal 0.45s ease 0.15s both;
        }
        .sp-logo-wrap > div {
          width: 100% !important; max-width: 100%;
          height: auto !important; aspect-ratio: 8 / 3;
        }
        @keyframes logoReveal {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sp-tagline {
          margin: 0; font: 600 12px/1.5 'Raleway', 'Inter', sans-serif;
          letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.72);
          animation: contentReveal 0.4s ease 0.5s both;
        }
        .sp-bar-wrap {
          width: 168px; height: 3px; overflow: hidden;
          background: rgba(255,255,255,0.18);
          animation: contentReveal 0.4s ease 0.65s both;
        }
        .sp-bar {
          width: 0; height: 100%; background: #07A04E;
          animation: barFill 1.35s ease 0.8s forwards;
        }
        @keyframes contentReveal { from { opacity: 0; } to { opacity: 1; } }
        @keyframes barFill { from { width: 0; } to { width: 100%; } }
        .sp-exit { animation: splashExit 0.5s ease forwards; }
        @keyframes splashExit { from { opacity: 1; } to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .sp-logo-wrap, .sp-tagline, .sp-bar-wrap, .sp-bar, .sp-exit { animation-duration: 0.01ms; }
        }
      `}</style>
    </div>
  );
}
