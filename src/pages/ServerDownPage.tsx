// src/pages/ServerDownPage.tsx
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";

function SurfaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-[28px] border border-slate-200 bg-white/94 shadow-[0_10px_30px_rgba(15,23,42,0.08)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export default function ServerDownPage() {
  return (
    <AnimatedAppBackground>
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <SurfaceCard className="w-full max-w-[680px] px-6 py-7">
          <div className="text-[28px] font-normal leading-tight text-slate-900">
            503. That’s an error.
          </div>

          <div className="mt-6 text-[15px] leading-7 text-slate-600">
            The server is temporarily unavailable and could not complete your
            request.
            <br />
            Please try again in a few minutes.
          </div>

          <div className="mt-8 text-[13px] text-slate-400">
            HTTP ERROR 503 — Service Unavailable
          </div>
        </SurfaceCard>
      </div>
    </AnimatedAppBackground>
  );
}
