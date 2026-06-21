/**
 * FormsSummaryCard.tsx — FULL & FINAL (UPDATED)
 *
 * Fix:
 * - removed unused React import
 */

export default function FormsSummaryCard({
  formsCount,
  cardCount,
  netCount,
}: {
  formsCount: number | null;
  cardCount: number | null;
  netCount: number | null;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm font-semibold mb-2">Forms & Payments</div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Forms</span>
          <span className="font-medium">{formsCount == null ? "…" : formsCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-600">Card</span>
          <span className="font-medium">{cardCount == null ? "…" : cardCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-600">Netbanking</span>
          <span className="font-medium">{netCount == null ? "…" : netCount}</span>
        </div>
      </div>

      <button
        onClick={() => (window.location.href = "/forms")}
        className="mt-4 w-full px-3 py-2 border rounded text-sm hover:bg-gray-50"
      >
        View Forms
      </button>
    </div>
  );
}