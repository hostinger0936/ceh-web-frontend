
/**
 * PaymentList.tsx — FULL & FINAL
 *
 * Generic payment payload list renderer.
 */

export default function PaymentList({
  title,
  items,
}: {
  title: string;
  items: any[];
}) {
  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-gray-400">{(items || []).length}</div>
      </div>

      {(items || []).length === 0 ? (
        <div className="text-sm text-gray-400">No entries</div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-auto">
          {(items || []).map((p, idx) => (
            <pre key={idx} className="p-2 border rounded text-xs bg-gray-50 overflow-auto">
              {JSON.stringify(p, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}