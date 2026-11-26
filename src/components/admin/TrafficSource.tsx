import { ExternalLink } from "lucide-react";
import { classifySource } from "@/lib/tracking";

export interface Attribution {
    referrer?: string | null;
    landing_page?: string | null;
    utm?: Record<string, string> | null;
}

const UTM_LABELS: Record<string, string> = {
    ref: "?ref",
    click_id: "Click id",
};

/** True when anything at all was recorded about how this visitor arrived. */
export function hasAttribution(a?: Attribution | null): boolean {
    return !!a && !!(a.referrer || a.landing_page || (a.utm && Object.keys(a.utm).length > 0));
}

/** Traffic source (of the latest visit) for the admin user / guest detail views. */
export default function TrafficSource({ attribution }: { attribution?: Attribution | null }) {
    if (!hasAttribution(attribution)) {
        return (
            <div className="ascii-box p-4 space-y-2">
                <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    TRAFFIC SOURCE
                </h3>
                <div className="ascii-dim text-xs">Not recorded yet — it is filled in the next time they open the site.</div>
            </div>
        );
    }

    const a = attribution!;
    const { source, medium } = classifySource(a);
    const utm = Object.entries(a.utm || {}).filter(([, v]) => typeof v === "string" && v);

    return (
        <div className="ascii-box p-4 space-y-2">
            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                TRAFFIC SOURCE
                <span className="ascii-dim text-[10px] font-normal">latest visit</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                    <div className="ascii-dim text-xs">Came from</div>
                    <div className="truncate">
                        <span className="ascii-highlight font-bold">{source}</span>
                        {medium !== source && <span className="ascii-dim text-xs"> · {medium}</span>}
                    </div>
                </div>
                <div>
                    <div className="ascii-dim text-xs">Referrer</div>
                    <div className="truncate" title={a.referrer || undefined}>{a.referrer || "(none)"}</div>
                </div>
                {a.landing_page && (
                    <div>
                        <div className="ascii-dim text-xs">Landing page</div>
                        <div className="truncate font-mono" title={a.landing_page}>{a.landing_page}</div>
                    </div>
                )}
                {utm.map(([k, v]) => (
                    <div key={k}>
                        <div className="ascii-dim text-xs">{UTM_LABELS[k] || `utm_${k}`}</div>
                        <div className="truncate" title={v}>{v}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
