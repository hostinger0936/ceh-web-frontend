import type { DeviceDoc } from "../../types";
import {
  pickLastSeenAt,
  pickLastSeenAction,
  pickLastSeenBattery,
  computeReachability,
  getReachabilityLabel,
  formatLastSeen,
} from "../../utils/reachability";

/**
 * DeviceMeta.tsx — FULL & FINAL (UPDATED for lastSeen migration)
 *
 * status.online → reachability (Responsive/Idle/Unreachable)
 * status.timestamp → lastSeen.at
 * Added: Last Action, Battery fields
 */

export default function DeviceMeta({ device }: { device: DeviceDoc }) {
  const m = device.metadata || {};

  const lastSeenAt = pickLastSeenAt(device);
  const reachability = computeReachability(lastSeenAt);
  const reachabilityLabel = getReachabilityLabel(reachability);
  const lastAction = pickLastSeenAction(device);
  const battery = pickLastSeenBattery(device);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Device ID</div>
        <div className="font-medium">{device.deviceId}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Reachability</div>
        <div className="font-medium">{reachabilityLabel}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Last Seen</div>
        <div className="font-medium">{formatLastSeen(lastSeenAt)}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Last Action</div>
        <div className="font-medium">{lastAction || "-"}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Battery</div>
        <div className="font-medium">{battery >= 0 ? `${battery}%` : "-"}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Forwarding</div>
        <div className="font-medium">{device.forwardingSim || "auto"}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Brand</div>
        <div className="font-medium">{String(m.brand || "-")}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Model</div>
        <div className="font-medium">{String(m.model || "-")}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Manufacturer</div>
        <div className="font-medium">{String(m.manufacturer || "-")}</div>
      </div>

      <div className="border rounded p-3">
        <div className="text-xs text-gray-500">Android</div>
        <div className="font-medium">{String(m.androidVersion || "-")}</div>
      </div>
    </div>
  );
}