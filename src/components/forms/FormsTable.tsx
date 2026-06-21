import type { FormSubmissionDoc } from "../../types";

/**
 * FormsTable.tsx — FULL & FINAL
 *
 * Reusable table for form submissions.
 * Note: Pages can use this, but it's also included to complete folder structure.
 */

export default function FormsTable({
  forms,
  onOpen,
}: {
  forms: FormSubmissionDoc[];
  onOpen?: (uniqueid: string) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs text-gray-500 border-b">
            <th className="py-2 px-3">UniqueID</th>
            <th className="py-2 px-3">Created</th>
            <th className="py-2 px-3">Payload</th>
            <th className="py-2 px-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {forms.map((f: any) => (
            <tr key={f._id || `${f.uniqueid}_${f.createdAt}`} className="border-b hover:bg-gray-50">
              <td className="py-2 px-3 font-medium">{f.uniqueid || "-"}</td>
              <td className="py-2 px-3 text-sm text-gray-600">
                {f.createdAt ? new Date(f.createdAt).toLocaleString() : "-"}
              </td>
              <td className="py-2 px-3 text-xs text-gray-600">
                <div className="max-w-[520px] truncate">{JSON.stringify(f.payload || {})}</div>
              </td>
              <td className="py-2 px-3">
                <button
                  className="px-3 py-1 border rounded text-sm"
                  onClick={() =>
                    onOpen ? onOpen(f.uniqueid) : (window.location.href = `/forms?uniqueid=${encodeURIComponent(f.uniqueid)}`)
                  }
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
          {forms.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-gray-400">
                No forms.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}