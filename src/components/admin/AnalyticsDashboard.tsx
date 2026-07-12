import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, Eye, Users, Clock, MousePointerClick, Globe } from "lucide-react";

interface Overview {
    total_events: number;
    page_views: number;
    unique_sessions: number;
    unique_guests: number;
    avg_dwell_ms: number;
    top_pages: Array<{ path: string; views: number; sessions: number }>;
    top_referrers: Array<{ referrer: string; sessions: number }>;
    daily: Array<{ day: string; views: number; sessions: number }>;
}

const RANGES = [
    { label: "24h", days: 1 },
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
];

export default function AnalyticsDashboard() {
    const [days, setDays] = useState(7);
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            setError(null);
            const { data: res, error: err } = await supabase.rpc("get_analytics_overview", { p_days: days });
            if (!active) return;
            if (err) {
                setError(err.message);
                setData(null);
            } else {
                setData(res as Overview);
            }
            setLoading(false);
        };
        load();
        return () => { active = false; };
    }, [days]);

    const fmtDwell = (ms: number) => {
        if (!ms) return "—";
        const s = Math.round(ms / 1000);
        return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
    };

    const maxDaily = data?.daily?.reduce((m, d) => Math.max(m, d.views), 0) || 1;

    return (
        <div className="ascii-box p-4 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="ascii-highlight text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> SITE ANALYTICS
                </h3>
                <div className="flex gap-1">
                    {RANGES.map((r) => (
                        <button
                            key={r.days}
                            onClick={() => setDays(r.days)}
                            className={`text-xs px-3 py-1 rounded border ${days === r.days ? "border-ascii-highlight text-ascii-highlight" : "border-ascii-border ascii-dim hover:text-ascii-text"}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && <div className="ascii-dim text-sm py-8 text-center">Loading analytics…</div>}
            {error && (
                <div className="text-red-400 text-sm py-4">
                    {error}
                    <div className="ascii-dim text-xs mt-1">Run <span className="font-mono">add-abuse-identity-analytics.sql</span> if this function is missing.</div>
                </div>
            )}

            {!loading && !error && data && (
                <>
                    {/* Stat cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Stat icon={<Eye className="w-4 h-4" />} label="Page views" value={data.page_views} />
                        <Stat icon={<Users className="w-4 h-4" />} label="Sessions" value={data.unique_sessions} />
                        <Stat icon={<MousePointerClick className="w-4 h-4" />} label="Guests" value={data.unique_guests} />
                        <Stat icon={<Clock className="w-4 h-4" />} label="Avg dwell" value={fmtDwell(data.avg_dwell_ms)} />
                        <Stat icon={<BarChart3 className="w-4 h-4" />} label="Events" value={data.total_events} />
                    </div>

                    {/* Daily bars */}
                    {data.daily && data.daily.length > 0 && (
                        <div>
                            <div className="ascii-dim text-xs mb-2">Page views / day</div>
                            <div className="flex items-end gap-1 h-28">
                                {data.daily.map((d) => (
                                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end group" title={`${d.day}: ${d.views} views, ${d.sessions} sessions`}>
                                        <div
                                            className="w-full bg-ascii-highlight/60 group-hover:bg-ascii-highlight rounded-t transition-all"
                                            style={{ height: `${Math.max(2, (d.views / maxDaily) * 100)}%` }}
                                        />
                                        <div className="ascii-dim text-[10px] mt-1 truncate w-full text-center">{d.day.slice(5)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Top pages */}
                        <div>
                            <div className="ascii-dim text-xs mb-2">Top pages</div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {(data.top_pages || []).map((p) => (
                                        <tr key={p.path} className="border-b border-ascii-border/30">
                                            <td className="py-1 font-mono truncate max-w-[220px]">{p.path}</td>
                                            <td className="py-1 text-right ascii-highlight">{p.views}</td>
                                            <td className="py-1 text-right ascii-dim text-xs">{p.sessions} sess</td>
                                        </tr>
                                    ))}
                                    {(!data.top_pages || data.top_pages.length === 0) && (
                                        <tr><td className="ascii-dim py-2 text-xs">No data yet</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Top referrers */}
                        <div>
                            <div className="ascii-dim text-xs mb-2 flex items-center gap-1"><Globe className="w-3 h-3" /> Top referrers</div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {(data.top_referrers || []).map((r) => (
                                        <tr key={r.referrer} className="border-b border-ascii-border/30">
                                            <td className="py-1 truncate max-w-[240px]">{r.referrer}</td>
                                            <td className="py-1 text-right ascii-highlight">{r.sessions}</td>
                                        </tr>
                                    ))}
                                    {(!data.top_referrers || data.top_referrers.length === 0) && (
                                        <tr><td className="ascii-dim py-2 text-xs">No data yet</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
    return (
        <div className="ascii-box p-3">
            <div className="ascii-dim text-xs mb-1 flex items-center gap-1">{icon} {label}</div>
            <div className="text-xl ascii-highlight">{value}</div>
        </div>
    );
}
