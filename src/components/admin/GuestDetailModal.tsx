import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    X,
    Hash,
    Mail,
    Monitor,
    Globe,
    Clock,
    MessageSquare,
    Shield,
    Flag,
    Ban,
    CheckCircle,
    AlertTriangle,
    FileText,
    Eye,
    EyeOff,
    Save,
    ExternalLink,
    Wifi,
    MapPin,
    Activity,
    Zap
} from "lucide-react";
import IPContentModal from "./IPContentModal";
import GuestTimeline from "./GuestTimeline";

interface Guest {
    id: string;
    fingerprint: string;
    fingerprint_hash: string | null;
    session_id: string | null;
    email: string | null;
    email_verified: boolean;
    post_count: number;
    comment_count: number;
    device_info: {
        userAgent?: string;
        screen?: string;
        timezone?: string;
        language?: string;
        platform?: string;
        colorDepth?: number;
        touchSupport?: boolean;
        deviceMemory?: number;
        hardwareConcurrency?: number;
    };
    // Network info
    ip_hash: string | null;
    country: string | null;
    city: string | null;
    isp: string | null;
    vpn_detected: boolean;
    tor_detected: boolean;
    // Behavior metrics
    posts_per_hour: number | null;
    avg_time_between_posts: number | null;
    last_focus_time: number | null;
    copy_paste_count: number;
    disposable_email_detected: boolean;
    // Trust
    trust_score: number;
    flags: string[];
    status: 'active' | 'blocked' | 'restricted';
    first_seen_at: string;
    last_seen_at: string;
    blocked_at: string | null;
    notes: string | null;
}

interface GuestPost {
    id: string;
    title: string;
    content: string;
    type: string;
    slug: string;
    hidden: boolean;
    created_at: string;
}

interface GuestDetailModalProps {
    guest: Guest;
    onClose: () => void;
    onUpdate: () => void;
}

export default function GuestDetailModal({ guest, onClose, onUpdate }: GuestDetailModalProps) {
    const [posts, setPosts] = useState<GuestPost[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [notes, setNotes] = useState(guest.notes || '');
    const [trustScore, setTrustScore] = useState(guest.trust_score);
    const [saving, setSaving] = useState(false);
    const [securityData, setSecurityData] = useState<{
        real_ip: string;
        ip_hash: string;
        last_seen_at: string;
        is_blocked?: boolean;
        stats?: {
            post_count: number;
            comment_count: number;
            guest_count: number;
            user_count: number;
        }
    } | null>(null);
    const [showIPContent, setShowIPContent] = useState<'posts' | 'comments' | null>(null);
    const [showRealIP, setShowRealIP] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        loadGuestPosts();
        loadSecurityData();
    }, [guest.id]);

    const loadSecurityData = async () => {
        try {
            const { data, error } = await supabase
                .from('ip_security_logs')
                .select('real_ip, ip_hash, last_seen_at')
                .eq('guest_id', guest.id)
                .maybeSingle();

            if (!error && data) {
                // Check if IP is blocked
                const { data: isBlocked } = await supabase.rpc('is_ip_blocked', { p_ip: data.real_ip });

                // Fetch IP stats
                const { data: stats } = await supabase.rpc('get_ip_content_stats', { p_ip: data.real_ip });

                setSecurityData({ ...data, is_blocked: isBlocked, stats });
            }
        } catch (err) {
            console.error('Error loading security data:', err);
        }
    };

    const handleBlockIP = async () => {
        if (!securityData?.real_ip) return;
        if (!confirm(`Are you sure you want to BLOCK this IP (${securityData.real_ip})?`)) return;

        try {
            const { error } = await supabase.rpc('block_ip', {
                p_ip: securityData.real_ip,
                p_reason: `Blocked via Guest Admin (GuestID: ${guest.id})`
            });

            if (error) throw error;

            toast({ title: "IP Blocked", description: "The IP address has been blocked from posting." });
            loadSecurityData(); // Refresh status
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const handleUnblockIP = async () => {
        if (!securityData?.real_ip) return;
        if (!confirm(`Unblock IP ${securityData.real_ip}?`)) return;

        try {
            const { error } = await supabase.rpc('unblock_ip', { p_ip: securityData.real_ip });

            if (error) throw error;

            toast({ title: "IP Unblocked", description: "The IP address has been unblocked." });
            loadSecurityData(); // Refresh status
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const loadGuestPosts = async () => {
        setLoadingPosts(true);
        try {
            const { data, error } = await supabase.rpc('get_guest_posts', {
                p_guest_id: guest.id
            });

            if (error) throw error;
            setPosts(data || []);
        } catch (error: any) {
            console.error('Error loading guest posts:', error);
            // Fallback: direct query
            try {
                const { data, error: fallbackError } = await supabase
                    .from('posts')
                    .select('id, title, content, type, slug, hidden, created_at')
                    .eq('guest_id', guest.id)
                    .order('created_at', { ascending: false });

                if (!fallbackError) {
                    setPosts(data || []);
                }
            } catch (e) {
                console.error('Fallback also failed:', e);
            }
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleSaveNotes = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('guests')
                .update({
                    notes,
                    trust_score: trustScore
                })
                .eq('id', guest.id);

            if (error) throw error;

            toast({
                title: "Success",
                description: "Guest notes and trust score updated",
            });
            onUpdate();
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to save: " + error.message,
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (newStatus: 'active' | 'blocked' | 'restricted') => {
        try {
            const updateData: any = { status: newStatus };
            if (newStatus === 'blocked') {
                updateData.blocked_at = new Date().toISOString();
            } else {
                updateData.blocked_at = null;
            }

            const { error } = await supabase
                .from('guests')
                .update(updateData)
                .eq('id', guest.id);

            if (error) throw error;

            toast({
                title: "Success",
                description: `Guest status changed to ${newStatus}`,
            });
            onUpdate();
            onClose();
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to update status: " + error.message,
                variant: "destructive",
            });
        }
    };

    const handleToggleFlag = async (flag: string) => {
        const hasFlag = guest.flags.includes(flag);
        const newFlags = hasFlag
            ? guest.flags.filter(f => f !== flag)
            : [...guest.flags, flag];

        try {
            const { error } = await supabase
                .from('guests')
                .update({ flags: newFlags })
                .eq('id', guest.id);

            if (error) throw error;

            toast({
                title: "Success",
                description: `Flag ${hasFlag ? 'removed' : 'added'}`,
            });
            onUpdate();
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to update flags: " + error.message,
                variant: "destructive",
            });
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-green-400';
            case 'blocked': return 'text-red-400';
            case 'restricted': return 'text-yellow-400';
            default: return 'ascii-dim';
        }
    };

    const parseUserAgent = (ua?: string) => {
        if (!ua) return { browser: 'Unknown', os: 'Unknown' };

        let browser = 'Unknown';
        let os = 'Unknown';

        // Detect browser
        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Safari')) browser = 'Safari';
        else if (ua.includes('Edge')) browser = 'Edge';
        else if (ua.includes('Opera')) browser = 'Opera';

        // Detect OS
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iOS') || ua.includes('iPhone')) os = 'iOS';

        return { browser, os };
    };

    const { browser, os } = parseUserAgent(guest.device_info?.userAgent);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="ascii-box bg-background max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ascii-border sticky top-0 bg-background z-10">
                    <h2 className="ascii-highlight text-lg flex items-center gap-2">
                        <Hash className="w-5 h-5" />
                        Guest Details
                    </h2>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="p-4 space-y-6">
                    {/* Overview Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Identity Info */}
                        <div className="ascii-box p-4 space-y-3">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2">IDENTITY</h3>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                    <Hash className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Fingerprint</div>
                                        <div className="font-mono break-all">{guest.fingerprint}</div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Mail className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div className="flex-1">
                                        <div className="ascii-dim text-xs">Email</div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {guest.email || <span className="ascii-dim">Not provided</span>}
                                            {guest.email && (
                                                guest.email_verified ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                                                        <CheckCircle className="w-3 h-3" />
                                                        Verified
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Pending
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Shield className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Status</div>
                                        <div className={`uppercase font-bold ${getStatusColor(guest.status)}`}>
                                            {guest.status}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Device Info */}
                        <div className="ascii-box p-4 space-y-3">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2">DEVICE</h3>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                    <Monitor className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Browser / OS</div>
                                        <div>{browser} on {os}</div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Monitor className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Screen</div>
                                        <div>{guest.device_info?.screen || 'Unknown'}</div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Globe className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Timezone / Language</div>
                                        <div>{guest.device_info?.timezone || 'Unknown'} / {guest.device_info?.language || 'Unknown'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Network Info - New Section */}
                    {/* Network Info - New Section */}
                    {guest.country || guest.isp || securityData ? (
                        <div className="ascii-box p-4 space-y-3">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 flex items-center gap-2">
                                <Wifi className="w-4 h-4" />
                                NETWORK INFO
                            </h3>

                            {(guest.country || guest.isp) && (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                            <div className="ascii-dim text-xs">Location</div>
                                            <div className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {guest.city || 'Unknown'}, {guest.country || 'Unknown'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="ascii-dim text-xs">ISP</div>
                                            <div>{guest.isp || 'Unknown'}</div>
                                        </div>
                                        <div>
                                            <div className="ascii-dim text-xs">VPN Detected</div>
                                            <div className={guest.vpn_detected ? 'text-red-400' : 'text-green-400'}>
                                                {guest.vpn_detected ? '⚠ YES' : 'No'}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="ascii-dim text-xs">Tor Detected</div>
                                            <div className={guest.tor_detected ? 'text-red-400' : 'text-green-400'}>
                                                {guest.tor_detected ? '⚠ YES' : 'No'}
                                            </div>
                                        </div>
                                    </div>
                                    {guest.ip_hash && (
                                        <div className="text-xs ascii-dim mt-2">
                                            Public Hash: <span className="font-mono select-all">{guest.ip_hash}</span>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Security Data (Admin Only) */}
                            {securityData && (
                                <div className={`pt-3 ${guest.country || guest.isp ? 'mt-4 border-t border-ascii-border/50' : ''} bg-red-950/20 p-3 rounded border border-red-500/20`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Shield className="w-3 h-3 text-red-400" />
                                            <span className="text-xs text-red-300 font-bold tracking-wider">SECURE ADMIN DATA</span>
                                        </div>
                                        {securityData.is_blocked ? (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                className="h-6 text-[10px] px-3 bg-red-600 hover:bg-red-700 font-bold"
                                                onClick={handleUnblockIP}
                                            >
                                                UNBLOCK IP
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 text-[10px] px-3 border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300 font-bold"
                                                onClick={handleBlockIP}
                                            >
                                                BLOCK IP
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                        <div>
                                            <div className="ascii-dim text-[10px] uppercase mb-1 flex items-center gap-2">
                                                Real IP Address
                                                <button
                                                    onClick={() => {
                                                        const newValue = !showRealIP;
                                                        setShowRealIP(newValue);
                                                        if (newValue) {
                                                            // Log IP Reveal Action
                                                            supabase.rpc('log_admin_action', {
                                                                p_action: 'reveal_ip',
                                                                p_target_type: 'guest',
                                                                p_target_id: guest.id,
                                                                p_details: { ip: securityData.real_ip }
                                                            }).then(({ error }) => {
                                                                if (error) console.error('Audit log failed', error);
                                                            });
                                                        }
                                                    }}
                                                    className="text-ascii-dim hover:text-white"
                                                    title={showRealIP ? "Hide IP" : "Reveal IP"}
                                                >
                                                    {showRealIP ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                </button>
                                            </div>
                                            <div className={`font-mono select-all font-bold break-all text-sm ${securityData.is_blocked ? 'text-red-500 line-through' : 'text-red-200'}`}>
                                                {showRealIP ? securityData.real_ip : securityData.real_ip.replace(/\.\d{1,3}\.\d{1,3}$/, '.***.***')}
                                            </div>
                                            {securityData.is_blocked && <span className="text-[10px] text-red-500 font-bold mt-1 block">BLOCKED</span>}
                                        </div>
                                        <div>
                                            <div className="ascii-dim text-[10px] uppercase mb-1">Secure Fingerprint</div>
                                            <div className="font-mono text-xs text-ascii-dim truncate" title={securityData.ip_hash || ''}>
                                                {securityData.ip_hash?.substring(0, 16)}...
                                            </div>
                                        </div>
                                    </div>

                                    {/* IP Content Stats */}
                                    {securityData.stats && (
                                        <div className="border-t border-red-500/20 pt-3 mt-2">
                                            <div className="text-[10px] uppercase text-red-300/70 mb-2 font-semibold">Activity from this IP (All Users)</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button
                                                    variant="ghost"
                                                    className="h-auto py-2 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 flex flex-col items-center gap-1"
                                                    onClick={() => setShowIPContent('posts')}
                                                >
                                                    <span className="text-lg font-bold text-red-200">{securityData.stats.post_count}</span>
                                                    <span className="text-[10px] text-red-300 uppercase">Posts</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    className="h-auto py-2 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 flex flex-col items-center gap-1"
                                                    onClick={() => setShowIPContent('comments')}
                                                >
                                                    <span className="text-lg font-bold text-red-200">{securityData.stats.comment_count}</span>
                                                    <span className="text-[10px] text-red-300 uppercase">Comments</span>
                                                </Button>
                                            </div>
                                            <div className="flex justify-between mt-2 text-[10px] text-red-400/60 px-1">
                                                <span>Linked Guests: {securityData.stats.guest_count}</span>
                                                <span>Linked Users: {securityData.stats.user_count}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="text-[10px] text-right mt-2 text-red-500/40 font-mono">
                                        Last Check: {new Date(securityData.last_seen_at).toLocaleString()}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}

                    {/* IP Content Modal */}
                    {securityData?.real_ip && (
                        <IPContentModal
                            isOpen={!!showIPContent}
                            onClose={() => setShowIPContent(null)}
                            ipAddress={securityData.real_ip}
                            type={showIPContent || 'posts'}
                        />
                    )}

                    {/* Behavior Metrics - New Section */}
                    <div className="ascii-box p-4 space-y-3">
                        <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            BEHAVIOR METRICS
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <div className="ascii-dim text-xs">Posts/Hour</div>
                                <div className={Number(guest.posts_per_hour) > 3 ? 'text-red-400' : ''}>
                                    {guest.posts_per_hour?.toFixed(1) || '0'}
                                    {Number(guest.posts_per_hour) > 3 && ' ⚠'}
                                </div>
                            </div>
                            <div>
                                <div className="ascii-dim text-xs">Avg Time Between</div>
                                <div>
                                    {guest.avg_time_between_posts
                                        ? `${Math.round(guest.avg_time_between_posts / 60)} min`
                                        : 'N/A'}
                                </div>
                            </div>
                            <div>
                                <div className="ascii-dim text-xs">Last Focus Time</div>
                                <div>
                                    {guest.last_focus_time
                                        ? `${Math.round(guest.last_focus_time / 1000)} sec`
                                        : 'N/A'}
                                </div>
                            </div>
                            <div>
                                <div className="ascii-dim text-xs">Copy-Paste Events</div>
                                <div className={guest.copy_paste_count > 5 ? 'text-yellow-400' : ''}>
                                    {guest.copy_paste_count}
                                </div>
                            </div>
                        </div>
                        {guest.disposable_email_detected && (
                            <div className="text-xs text-red-400 flex items-center gap-1 mt-2">
                                <AlertTriangle className="w-3 h-3" />
                                Disposable email detected
                            </div>
                        )}
                    </div>

                    {/* Activity & Trust */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="ascii-box p-4 text-center">
                            <div className="ascii-dim text-xs mb-1">POSTS</div>
                            <div className="text-2xl ascii-highlight">{guest.post_count}</div>
                        </div>
                        <div className="ascii-box p-4 text-center">
                            <div className="ascii-dim text-xs mb-1">TRUST SCORE</div>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={trustScore}
                                onChange={(e) => setTrustScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                className="text-2xl ascii-highlight text-center bg-transparent border-b border-ascii-border w-20"
                            />
                            <span className="ascii-dim">%</span>
                        </div>
                        <div className="ascii-box p-4 text-center">
                            <div className="ascii-dim text-xs mb-1">FIRST SEEN</div>
                            <div className="text-sm">{new Date(guest.first_seen_at).toLocaleDateString()}</div>
                            <div className="text-xs ascii-dim">{new Date(guest.first_seen_at).toLocaleTimeString()}</div>
                        </div>
                    </div>

                    {/* Flags */}
                    <div className="ascii-box p-4">
                        <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3">FLAGS</h3>
                        <div className="flex flex-wrap gap-2">
                            {['spam', 'suspicious', 'trusted', 'verified', 'new'].map((flag) => (
                                <button
                                    key={flag}
                                    onClick={() => handleToggleFlag(flag)}
                                    className={`px-3 py-1 text-xs rounded border transition-colors ${guest.flags.includes(flag)
                                        ? flag === 'spam' || flag === 'suspicious'
                                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                            : flag === 'trusted' || flag === 'verified'
                                                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                        : 'bg-gray-500/10 text-gray-500 border-gray-500/30 hover:bg-gray-500/20'
                                        }`}
                                >
                                    {flag.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Admin Notes */}
                    <div className="ascii-box p-4">
                        <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3">ADMIN NOTES</h3>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add notes about this guest..."
                            className="w-full h-24 bg-transparent border border-ascii-border p-2 text-sm resize-none focus:outline-none focus:border-ascii-highlight"
                        />
                        <div className="flex justify-end mt-2">
                            <Button
                                onClick={handleSaveNotes}
                                disabled={saving}
                                size="sm"
                                className="ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90"
                            >
                                <Save className="w-4 h-4 mr-1" />
                                {saving ? 'Saving...' : 'Save Notes & Score'}
                            </Button>
                        </div>
                    </div>

                    {/* Guest Posts */}
                    <div className="ascii-box p-4">
                        <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            POSTS BY THIS GUEST ({posts.length})
                        </h3>

                        {loadingPosts ? (
                            <div className="text-center py-4 ascii-dim">Loading posts...</div>
                        ) : posts.length === 0 ? (
                            <div className="text-center py-4 ascii-dim">No posts found</div>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {posts.map((post) => (
                                    <div key={post.id} className="flex items-center justify-between p-2 border border-ascii-border/50 hover:bg-white/5">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono truncate">
                                                    {post.title || '(Untitled)'}
                                                </span>
                                                {post.hidden && (
                                                    <span title="Hidden">
                                                        <EyeOff className="w-3 h-3 text-yellow-400" />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs ascii-dim flex items-center gap-2">
                                                <Clock className="w-3 h-3" />
                                                {new Date(post.created_at).toLocaleDateString()}
                                                <span className="text-xs uppercase">{post.type}</span>
                                            </div>
                                        </div>
                                        <a
                                            href={`/post/${post.slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 p-1"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-4 border-t border-ascii-border">
                        {guest.status === 'active' ? (
                            <>
                                <Button
                                    onClick={() => handleStatusChange('restricted')}
                                    variant="outline"
                                    className="ascii-box text-yellow-400 hover:bg-yellow-900/20"
                                >
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    Restrict Guest
                                </Button>
                                <Button
                                    onClick={() => handleStatusChange('blocked')}
                                    variant="outline"
                                    className="ascii-box text-red-400 hover:bg-red-900/20"
                                >
                                    <Ban className="w-4 h-4 mr-2" />
                                    Block Guest
                                </Button>
                            </>
                        ) : (
                            <Button
                                onClick={() => handleStatusChange('active')}
                                variant="outline"
                                className="ascii-box text-green-400 hover:bg-green-900/20"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Unblock Guest
                            </Button>
                        )}
                    </div>

                    {/* Timeline */}
                    <div className="ascii-box p-4">
                        <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            ACTIVITY TIMELINE
                        </h3>
                        <GuestTimeline guestId={guest.id} />
                    </div>
                </div>
            </div>
        </div>
    );
}
