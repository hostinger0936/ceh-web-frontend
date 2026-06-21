import type { DeviceDoc } from "../../types";
import Badge from "../ui/Badge";
import {
  pickLastSeenAt,
  computeReachability,
  getReachabilityLabel,
  formatLastSeen,
} from "../../utils/reachability";

/**
 * DeviceTable.tsx — FULL & FINAL (UPDATED for lastSeen migration)
 *
 * status.online → computeReachability(lastSeen.at)
 * status.timestamp → pickLastSeenAt()
 */

export default function DeviceTable({
  devices,
  onOpen,
}: {
  devices: DeviceDoc[];
  onOpen?: (deviceId: string) => void;
}) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs text-gray-500 border-b">
            <th className="py-2 px-3">Device ID</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Last Seen</th>
            <th className="py-2 px-3">Admins</th>
            <th className="py-2 px-3">Forwarding</th>
            <th className="py-2 px-3">Action</th>
          </tr>
        </thead>

        <tbody>
          {devices.map((d) => {
            const lastSeenAt = pickLastSeenAt(d);
            const reachability = computeReachability(lastSeenAt);
            const label = getReachabilityLabel(reachability);
            const badgeTone =
              reachability === "responsive" ? "green" : reachability === "idle" ? "yellow" : "red";

            return (
              <tr key={d.deviceId} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">
                  <span className="font-medium">{d.deviceId}</span>
                  <div className="text-xs text-gray-400">{d.metadata?.model || ""}</div>
                </td>

                <td className="py-2 px-3">
                  <Badge tone={badgeTone}>{label}</Badge>
                </td>

                <td className="py-2 px-3 text-sm text-gray-600">
                  {formatLastSeen(lastSeenAt)}
                </td>

                <td className="py-2 px-3 text-sm">{(d.admins || []).length}</td>

                <td className="py-2 px-3 text-sm">{d.forwardingSim || "auto"}</td>

                <td className="py-2 px-3">
                  <button
                    className="px-3 py-1 border rounded text-sm"
                    onClick={() =>
                      onOpen ? onOpen(d.deviceId) : (window.location.href = `/devices/${encodeURIComponent(d.deviceId)}`)
                    }
                  >
                    Open
                  </button>
                </td>
              </tr>
            );
          })}

          {devices.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-gray-400">
                No devices.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}