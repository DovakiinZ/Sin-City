import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
    X,
    Hash,
    Monitor,
    Globe,
    Clock,
    Shield,
    AlertTriangle,
    FileText,
    User,
    Activity,
    ExternalLink
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface GuestInfo {
    id: string;
    anonymous_id: string;
    fingerprint: string;
    status: 'active' | 'blocked' | 'restricted';
    trust_score: number;
    flags: string[];
    device_info: {
        userAgent?: string;
        screen?: string;
        timezone?: string;
        language?: string;
        platform?: string;
    } | null;
    country: string | null;
    city: string | null;
    isp: string | null;
    vpn_detected: boolean;
    tor_detected: boolean;
    post_count: number;
    comment_count: number;
    first_seen_at: string;
    last_seen_at: string;
}

interface AdminPostInspectorProps {
    guestId: string;
    onClose: () => void;
    onViewProfile?: () => void;
}

export default function AdminPostInspector({ guestId, onClose, onViewProfile }: AdminPostInspectorProps) {
    const [guest, setGuest] = useState<GuestInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadGuest = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from('guests')
                    .select('*')
                    .eq('id', guestId)
                    .single();

                if (fetchError) throw fetchError;
                setGuest(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load guest info');
            } finally {
                setLoading(false);
            }
        };

        loadGuest();
    }, [guestId]);

    const parseUserAgent = (ua?: string) => {
        if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

        let browser = 'Unknown';
        let os = 'Unknown';
        let device = 'Desktop';

        // Browser detection
        if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Safari')) browser = 'Safari';
        else if (ua.includes('Edge')) browser = 'Edge';

        // OS detection
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

        // Device detection
        if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
            device = 'Mobile';
        } else if (ua.includes('iPad') || ua.includes('Tablet')) {
            device = 'Tablet';
        }

        return { browser, os, device };
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-green-400';
            case 'blocked': return 'text-red-400';
            case 'restricted': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    const getTrustColor = (score: number) => {
        if (score >= 70) return 'text-green-400';
        if (score >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="bg-gray-900 border border-green-700/50 rounded-lg p-6">
                    <div className="flex items-center gap-3 text-green-400">
                        <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                        Loading guest info...
                    </div>
                </div>
            </div>
        );
    }

    if (error || !guest) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="bg-gray-900 border border-red-700/50 rounded-lg p-6 max-w-sm">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-red-400">Error</span>
                        <button onClick={onClose} className="text-gray-500 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-gray-400">{error || 'Guest not found'}</p>
                </div>
            </div>
        );
    }

    const deviceInfo = parseUserAgent(guest.device_info?.userAgent);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-gray-900 border border-green-700/50 rounded-lg w-full max-w-md max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gray-900 border-b border-green-700/30 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <User className="w-5 h-5 text-yellow-500" />
                        <span className="font-mono text-yellow-500 font-medium">{guest.anonymous_id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(guest.status)} bg-current/10`}>
                            {guest.status}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Trust Score */}
                    <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-green-900/30">
                        <span className="text-gray-400 text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Trust Score
                        </span>
                        <span className={`font-mono text-lg ${getTrustColor(guest.trust_score)}`}>
                            {guest.trust_score}/100
                        </span>
                    </div>

                    {/* Flags */}
                    {guest.flags && guest.flags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {guest.flags.map((flag, i) => (
                                <span
                                    key={i}
                                    className={`text-xs px-2 py-1 rounded border ${flag === 'spam' || flag === 'suspicious'
                                        ? 'border-red-500/50 bg-red-500/10 text-red-400'
                                        : flag === 'verified' || flag === 'trusted'
                                            ? 'border-green-500/50 bg-green-500/10 text-green-400'
                                            : 'border-gray-500/50 bg-gray-500/10 text-gray-400'
                                        }`}
                                >
                                    {flag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* VPN/Tor Warning */}
                    {(guest.vpn_detected || guest.tor_detected) && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            {guest.vpn_detected && guest.tor_detected
                                ? 'VPN + Tor detected'
                                : guest.vpn_detected ? 'VPN detected' : 'Tor detected'
                            }
                        </div>
                    )}

                    {/* Device Info */}
                    <div className="space-y-2">
                        <h4 className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <Monitor className="w-3 h-3" />
                            Device
                        </h4>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="bg-black/40 p-2 rounded border border-green-900/30">
                                <div className="text-gray-500 text-xs">Browser</div>
                                <div className="text-green-300">{deviceInfo.browser}</div>
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-green-900/30">
                                <div className="text-gray-500 text-xs">OS</div>
                                <div className="text-green-300">{deviceInfo.os}</div>
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-green-900/30">
                                <div className="text-gray-500 text-xs">Device</div>
                                <div className="text-green-300">{deviceInfo.device}</div>
                            </div>
                        </div>
                        {guest.device_info?.screen && (
                            <div className="text-xs text-gray-500">
                                Screen: {guest.device_info.screen}
                            </div>
                        )}
                    </div>

                    {/* Location */}
                    {(guest.country || guest.city) && (
                        <div className="space-y-2">
                            <h4 className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Globe className="w-3 h-3" />
                                Location
                            </h4>
                            <div className="bg-black/40 p-3 rounded border border-green-900/30">
                                <div className="text-green-300">
                                    {[guest.city, guest.country].filter(Boolean).join(', ')}
                                </div>
                                {guest.isp && (
                                    <div className="text-xs text-gray-500 mt-1">ISP: {guest.isp}</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Activity */}
                    <div className="space-y-2">
                        <h4 className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-3 h-3" />
                            Activity
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/40 p-3 rounded border border-green-900/30">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-500" />
                                    <span className="text-lg text-green-300">{guest.post_count}</span>
                                </div>
                                <div className="text-xs text-gray-500">Posts</div>
                            </div>
                            <div className="bg-black/40 p-3 rounded border border-green-900/30">
                                <div className="flex items-center gap-2">
                                    <Hash className="w-4 h-4 text-gray-500" />
                                    <span className="text-lg text-green-300">{guest.comment_count || 0}</span>
                                </div>
                                <div className="text-xs text-gray-500">Comments</div>
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="space-y-2">
                        <h4 className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            Timeline
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-black/40 p-2 rounded border border-green-900/30">
                                <div className="text-gray-500 text-xs">First Seen</div>
                                <div className="text-green-300 text-xs">
                                    {formatDistanceToNow(new Date(guest.first_seen_at), { addSuffix: true })}
                                </div>
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-green-900/30">
                                <div className="text-gray-500 text-xs">Last Active</div>
                                <div className="text-green-300 text-xs">
                                    {formatDistanceToNow(new Date(guest.last_seen_at), { addSuffix: true })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fingerprint (truncated) */}
                    <div className="space-y-2">
                        <h4 className="text-xs text-gray-500 uppercase tracking-wider">Fingerprint</h4>
                        <div className="bg-black/40 p-2 rounded border border-green-900/30 font-mono text-xs text-gray-500 break-all">
                            {guest.fingerprint}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-900 border-t border-green-700/30 p-4">
                    <button
                        onClick={() => {
                            onClose();
                            window.open(`/crowd?tab=guests&guest=${guest.id}`, '_blank');
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-black font-medium rounded transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                        View Full Profile
                    </button>
                </div>
            </div>
        </div>
    );
}
