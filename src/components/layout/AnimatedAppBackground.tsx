import { memo } from "react";

type AnimatedAppBackgroundProps = {
  className?: string;
  children?: React.ReactNode;
};

function AnimatedAppBackgroundBase({
  className = "",
  children,
}: AnimatedAppBackgroundProps) {
  return (
    <div
      className={[
        "relative min-h-[100svh] w-full overflow-x-hidden bg-[#f6f8fb]",
        className,
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.92]"
          style={{
            background:
              "linear-gradient(180deg, #f8fbff 0%, #f3f7fc 45%, #edf3f9 100%)",
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 18%, rgba(56,189,248,0.18), transparent 24%), radial-gradient(circle at 82% 14%, rgba(99,102,241,0.10), transparent 18%), radial-gradient(circle at 78% 78%, rgba(34,197,94,0.10), transparent 18%), radial-gradient(circle at 10% 82%, rgba(14,165,233,0.10), transparent 16%)",
          }}
        />

        <div className="absolute inset-0 opacity-[0.16] [background-size:26px_26px] [background-image:linear-gradient(to_right,rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.08)_1px,transparent_1px)]" />

        <div
          className="absolute -left-24 top-[-80px] h-[280px] w-[280px] rounded-full bg-sky-300/30 blur-3xl animate-[floatSoft_18s_ease-in-out_infinite]"
          style={{ willChange: "transform" }}
        />
        <div
          className="absolute right-[-90px] top-[10%] h-[240px] w-[240px] rounded-full bg-cyan-300/20 blur-3xl animate-[floatSoft2_22s_ease-in-out_infinite]"
          style={{ willChange: "transform" }}
        />
        <div
          className="absolute bottom-[-110px] left-[12%] h-[260px] w-[260px] rounded-full bg-indigo-300/20 blur-3xl animate-[floatSoft3_24s_ease-in-out_infinite]"
          style={{ willChange: "transform" }}
        />
        <div
          className="absolute bottom-[8%] right-[8%] h-[180px] w-[180px] rounded-full bg-emerald-200/20 blur-3xl animate-[floatSoft_20s_ease-in-out_infinite]"
          style={{ willChange: "transform" }}
        />

        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.32),rgba(255,255,255,0.06)_20%,rgba(255,255,255,0)_40%)]" />
      </div>

      <style>
        {`
          @keyframes floatSoft {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            25% { transform: translate3d(18px, 26px, 0) scale(1.04); }
            50% { transform: translate3d(-8px, 42px, 0) scale(0.98); }
            75% { transform: translate3d(-20px, 18px, 0) scale(1.03); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }

          @keyframes floatSoft2 {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            25% { transform: translate3d(-12px, 22px, 0) scale(1.03); }
            50% { transform: translate3d(14px, 38px, 0) scale(0.97); }
            75% { transform: translate3d(24px, 16px, 0) scale(1.02); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }

          @keyframes floatSoft3 {
            0% { transform: translate3d(0, 0, 0) scale(1); }
            25% { transform: translate3d(20px, -10px, 0) scale(1.02); }
            50% { transform: translate3d(-10px, -24px, 0) scale(0.98); }
            75% { transform: translate3d(-22px, -8px, 0) scale(1.04); }
            100% { transform: translate3d(0, 0, 0) scale(1); }
          }

          @media (prefers-reduced-motion: reduce) {
            .animate-\\[floatSoft_18s_ease-in-out_infinite\\],
            .animate-\\[floatSoft2_22s_ease-in-out_infinite\\],
            .animate-\\[floatSoft3_24s_ease-in-out_infinite\\],
            .animate-\\[floatSoft_20s_ease-in-out_infinite\\] {
              animation: none !important;
            }
          }
        `}
      </style>

      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

const AnimatedAppBackground = memo(AnimatedAppBackgroundBase);

export default AnimatedAppBackground;
