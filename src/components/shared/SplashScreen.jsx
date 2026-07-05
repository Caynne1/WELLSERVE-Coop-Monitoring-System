import WellserveLogo from './WellserveLogo';

/**
 * SplashScreen — animated logo intro shown before the login page.
 * Props:
 *   onDone  — callback fired when the exit animation completes
 *   exiting — boolean; when true, plays the fade-out animation
 */
export default function SplashScreen({ onDone, exiting }) {
  return (
    <div className={`sp-root${exiting ? ' sp-exit' : ''}`} onAnimationEnd={exiting ? onDone : undefined}>

      {/* ── Radial gradient background ── */}
      <div className="sp-bg" />

      {/* ── Floating orbs for depth ── */}
      <div className="sp-orb sp-orb-1" />
      <div className="sp-orb sp-orb-2" />
      <div className="sp-orb sp-orb-3" />

      {/* ── Animated ring pulses around the logo ── */}
      <div className="sp-rings">
        <div className="sp-ring sp-ring-1" />
        <div className="sp-ring sp-ring-2" />
        <div className="sp-ring sp-ring-3" />
      </div>

      {/* ── Core content ── */}
      <div className="sp-content">

        {/* Logo with pop-in */}
        <div className="sp-logo-wrap">
          <WellserveLogo size={88} variant="light" />
        </div>

        {/* Brand name — letters fade in sequentially */}
        <div className="sp-name-row">
          {'WELLSERVE'.split('').map((ch, i) => (
            <span
              key={i}
              className="sp-letter"
              style={{ animationDelay: `${0.55 + i * 0.06}s` }}
            >
              {ch}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <p className="sp-tagline">Credit Cooperative Monitoring System</p>

        {/* Thin progress bar */}
        <div className="sp-bar-wrap">
          <div className="sp-bar" />
        </div>
      </div>

      <style>{`
        .sp-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }

        /* ── Background ── */
        .sp-bg {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 40% 40%, #000099 0%, #000066 40%, #00002e 100%);
        }

        /* ── Floating orbs ── */
        .sp-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(60px);
          pointer-events: none;
        }
        .sp-orb-1 {
          width: 420px; height: 420px;
          background: rgba(59, 91, 219, 0.20);
          top: -100px; left: -120px;
          animation: orbDrift1 8s ease-in-out infinite;
        }
        .sp-orb-2 {
          width: 320px; height: 320px;
          background: rgba(99, 132, 255, 0.16);
          bottom: -80px; right: -80px;
          animation: orbDrift2 10s ease-in-out infinite;
        }
        .sp-orb-3 {
          width: 200px; height: 200px;
          background: rgba(0, 0, 153, 0.28);
          top: 30%; left: 60%;
          animation: orbDrift3 7s ease-in-out infinite;
        }
        @keyframes orbDrift1 {
          0%,100% { transform: translate(0,0); }
          50%      { transform: translate(40px, 30px); }
        }
        @keyframes orbDrift2 {
          0%,100% { transform: translate(0,0); }
          50%      { transform: translate(-30px, -25px); }
        }
        @keyframes orbDrift3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(-20px, 15px) scale(1.1); }
        }

        /* ── Pulsing rings ── */
        .sp-rings {
          position: absolute;
          display: flex; align-items: center; justify-content: center;
        }
        .sp-ring {
          position: absolute;
          border-radius: 50%;
          border: 1.5px solid rgba(99, 132, 255, 0.4);
          animation: ringPulse 2.4s ease-out infinite;
          opacity: 0;
        }
        .sp-ring-1 { width: 160px; height: 160px; animation-delay: 0.3s; }
        .sp-ring-2 { width: 220px; height: 220px; animation-delay: 0.8s; }
        .sp-ring-3 { width: 290px; height: 290px; animation-delay: 1.3s; }
        @keyframes ringPulse {
          0%   { opacity: 0.7; transform: scale(0.82); }
          100% { opacity: 0;   transform: scale(1.18); }
        }

        /* ── Content ── */
        .sp-content {
          position: relative; z-index: 10;
          display: flex; flex-direction: column;
          align-items: center; gap: 20px;
        }

        /* Logo pop */
        .sp-logo-wrap {
          animation: logoPop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
        }
        @keyframes logoPop {
          from { opacity: 0; transform: scale(0.55); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* Letter-by-letter name */
        .sp-name-row {
          display: flex; gap: 1px;
        }
        .sp-letter {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          font-size: 36px; font-weight: 900;
          letter-spacing: 0.18em;
          color: #ffffff;
          opacity: 0;
          animation: letterFadeUp 0.35s ease forwards;
          text-shadow: 0 2px 16px rgba(0,0,0,0.3);
        }
        @keyframes letterFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Tagline */
        .sp-tagline {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          font-size: 13px; font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.60);
          opacity: 0;
          animation: fadeInUp 0.5s ease 1.2s forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Progress bar */
        .sp-bar-wrap {
          width: 160px; height: 3px;
          background: rgba(255,255,255,0.12);
          border-radius: 999px; overflow: hidden;
          margin-top: 8px;
          opacity: 0;
          animation: fadeInUp 0.4s ease 1.4s forwards;
        }
        .sp-bar {
          height: 100%;
          background: linear-gradient(90deg, #6384ff, #000099);
          border-radius: 999px;
          width: 0%;
          animation: barFill 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) 1.5s forwards;
        }
        @keyframes barFill {
          from { width: 0%; }
          to   { width: 100%; }
        }

        /* ── Exit: whole screen fades up ── */
        .sp-exit {
          animation: splashExit 0.55s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes splashExit {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}