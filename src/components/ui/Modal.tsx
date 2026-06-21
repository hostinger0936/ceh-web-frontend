import React, { useEffect } from "react";

/**
 * Modal.tsx — FULL & FINAL
 *
 * Minimal modal:
 * - ESC closes
 * - Click overlay closes
 * - No external deps
 */

type Props = {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClassName?: string; // e.g. "max-w-lg"
};

export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  widthClassName = "max-w-lg",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`w-full ${widthClassName} bg-white rounded-xl shadow-lg overflow-hidden`}>
          {title ? (
            <div className="px-4 py-3 border-b">
              <div className="font-semibold">{title}</div>
            </div>
          ) : null}

          <div className="p-4">{children}</div>

          {footer ? <div className="px-4 py-3 border-t bg-gray-50">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}