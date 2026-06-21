import React, { useEffect, useMemo, useState } from "react";
import Button from "./Button";

/**
 * CountDown.tsx — FULL & FINAL
 *
 * Reusable countdown widget.
 * - expiryDate format: YYYY-MM-DD
 * - onRenew optional callback (e.g. open WhatsApp)
 *
 * Note: Dashboard currently computes countdown internally, but this component is kept
 * for structure completeness + future reuse.
 */

type Props = {
  expiryDate: string; // YYYY-MM-DD
  title?: string;
  subtitle?: string;
  onRenew?: () => void;
  renewLabel?: string;
};

export default function CountDown({
  expiryDate,
  title = "License Countdown",
  subtitle,
  onRenew,
  renewLabel = "Renew",
}: Props) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  const target = useMemo(() => {
    if (!expiryDate) return null;
    const d = new Date(`${expiryDate}T23:59:59Z`);
    return isNaN(d.getTime()) ? null : d;
  }, [expiryDate]);

  useEffect(() => {
    if (!target) {
      setTimeLeft(null);
      return;
    }
    let mounted = true;

    const tick = () => {
      const now = new Date();
      let diff = Math.max(0, target.getTime() - now.getTime());

      const days = Math.floor(diff / (24 * 3600 * 1000));
      diff -= days * 24 * 3600 * 1000;

      const hours = Math.floor(diff / (3600 * 1000));
      diff -= hours * 3600 * 1000;

      const minutes = Math.floor(diff / (60 * 1000));
      diff -= minutes * 60 * 1000;

      const seconds = Math.floor(diff / 1000);

      if (mounted) setTimeLeft({ days, hours, minutes, seconds });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [target]);

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{title}</div>
          {subtitle ? <div className="text-sm text-gray-500">{subtitle}</div> : null}
        </div>
        {onRenew ? (
          <Button variant="primary" onClick={onRenew}>
            {renewLabel}
          </Button>
        ) : null}
      </div>

      <div className="mt-3">
        {!timeLeft ? (
          <div className="text-sm text-gray-400">Not configured</div>
        ) : (
          <div>
            <div className="text-2xl font-semibold">
              {timeLeft.days}d {timeLeft.hours}h
            </div>
            <div className="text-sm text-gray-500">
              {timeLeft.minutes}m {timeLeft.seconds}s
            </div>
          </div>
        )}
      </div>
    </div>
  );
}