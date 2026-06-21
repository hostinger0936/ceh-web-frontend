import { Card, CardBody } from "../ui/Card";

/**
 * SummaryCards.tsx — FULL & FINAL (UPDATED for lastSeen migration)
 *
 * Props changed: online/offline → responsive/idle/unreachable
 * Grid: 4 cols → 5 cols
 */

export default function SummaryCards({
  total,
  responsive,
  idle,
  unreachable,
  forms,
}: {
  total: number;
  responsive: number;
  idle: number;
  unreachable: number;
  forms: number | null;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card>
        <CardBody>
          <div className="text-xs text-gray-500">Total Devices</div>
          <div className="text-2xl font-bold">{total}</div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="text-xs text-gray-500">Responsive</div>
          <div className="text-2xl font-bold text-green-600">{responsive}</div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="text-xs text-gray-500">Idle</div>
          <div className="text-2xl font-bold text-amber-600">{idle}</div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="text-xs text-gray-500">Unreachable</div>
          <div className="text-2xl font-bold text-red-600">{unreachable}</div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="text-xs text-gray-500">All Form Submits</div>
          <div className="text-2xl font-bold">{forms == null ? "…" : forms}</div>
        </CardBody>
      </Card>
    </div>
  );
}