import { useState } from "react";
import Button from "../ui/Button";

/**
 * SimInfoForm.tsx — FULL & FINAL (UPDATED)
 *
 * Fix:
 * - removed unused React default import (TS6133)
 *
 * Generic JSON editor for simInfo.
 * - Input: initial simInfo object
 * - Output: onSave(parsedObject)
 */

export default function SimInfoForm({
  initial,
  onSave,
}: {
  initial: any;
  onSave: (simInfo: any) => Promise<void> | void;
}) {
  const [text, setText] = useState<string>(JSON.stringify(initial || {}, null, 2));
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    try {
      const parsed = JSON.parse(text || "{}");
      setBusy(true);
      await onSave(parsed);
      alert("Saved");
    } catch {
      alert("Invalid JSON");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">Edit simInfo as JSON:</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full border rounded p-2 h-56 font-mono text-xs"
      />

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={handleSave} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={() => setText(JSON.stringify(initial || {}, null, 2))}>
          Reset
        </Button>
      </div>
    </div>
  );
}