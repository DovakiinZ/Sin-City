import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    X,
    Hash,
    Mail,
    Globe,
    Shield,
    CheckCircle,
    Eye,
    EyeOff,
    ExternalLink,
    Wifi,
    MapPin,
    Calendar
} from "lucide-react";
import IPContentModal from "./IPContentModal";
import UserTimeline from "./UserTimeline";

interface UserProfile {
    id: string;
    username: string;
    email?: string;
    role: string;
    created_at: string;
    country?: string | null;
    city?: string | null;
    ip_hash?: string | null;
    isp?: string | null;
    vpn_detected?: boolean;
    tor_detected?: boolean;
    last_ip_update?: string | null;
    securityData?: { real_ip: string; ip_fingerprint: string; last_seen_at: string; is_blocked?: boolean } | null;
}

interface UserDetailModalProps {
    user: UserProfile;
    onClose: () => void;
    onUpdate: () => void;
}

export default function UserDetailModal({ user, onClose, onUpdate }: UserDetailModalProps) {
    const [securityData, setSecurityData] = useState<{
        real_ip: string;
        ip_fingerprint: string;
        last_seen_at: string;
        is_blocked?: boolean;
        stats?: {
            post_count: number;
            comment_count: number;
            guest_count: number;
            user_count: number;
        }
    } | null>(user.securityData ? { ...user.securityData } : null); // Initialize with passed data if available

    const [showIPContent, setShowIPContent] = useState<'posts' | 'comments' | null>(null);
    const [showRealIP, setShowRealIP] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        loadSecurityData();
    }, [user.id]);

    const loadSecurityData = async () => {
        try {
            // If we already have basic security data passed in, we still might want to fetch fresh stats
            // But main source is ip_security_logs
            const { data, error } = await supabase
                .from('ip_security_logs')
                .select('real_ip, ip_fingerprint, last_seen_at')
                .eq('user_id', user.id)
                .order('last_seen_at', { ascending: false })
                .limit(1)
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
                p_reason: `Blocked via User Admin (UserID: ${user.id})`
            });

            if (error) throw error;

            toast({ title: "IP Blocked", description: "The IP address has been blocked from posting." });
            loadSecurityData(); // Refresh status
            onUpdate();
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
            onUpdate();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="ascii-box bg-background max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ascii-border sticky top-0 bg-background z-10">
                    <h2 className="ascii-highlight text-lg flex items-center gap-2">
                        <Hash className="w-5 h-5" />
                        User Details: {user.username}
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
                                        <div className="ascii-dim text-xs">User ID</div>
                                        <div className="font-mono break-all text-xs">{user.id}</div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Mail className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div className="flex-1">
                                        <div className="ascii-dim text-xs">Email</div>
                                        <div className="flex items-center gap-2 flex-wrap select-all">
                                            {user.email || <span className="ascii-dim">Not provided (hidden)</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Shield className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Role</div>
                                        <div className="uppercase font-bold text-green-400">
                                            {user.role}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2">
                                    <Calendar className="w-4 h-4 ascii-dim mt-0.5" />
                                    <div>
                                        <div className="ascii-dim text-xs">Joined</div>
                                        <div>{new Date(user.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Network Info */}
                        <div className="ascii-box p-4 space-y-3">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 flex items-center gap-2">
                                <Wifi className="w-4 h-4" />
                                NETWORK INFO
                            </h3>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="ascii-dim text-xs">Location</div>
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {user.city || 'Unknown'}, {user.country || 'Unknown'}
                                    </div>
                                </div>
                                <div>
                                    <div className="ascii-dim text-xs">ISP</div>
                                    <div>{user.isp || 'Unknown'}</div>
                                </div>
                                <div>
                                    <div className="ascii-dim text-xs">VPN Detected</div>
                                    <div className={user.vpn_detected ? 'text-red-400' : 'text-green-400'}>
                                        {user.vpn_detected ? '⚠ YES' : 'No'}
                                    </div>
                                </div>
                                <div>
                                    <div className="ascii-dim text-xs">Tor Detected</div>
                                    <div className={user.tor_detected ? 'text-red-400' : 'text-green-400'}>
                                        {user.tor_detected ? '⚠ YES' : 'No'}
                                    </div>
                                </div>
                            </div>
                            {user.ip_hash && (
                                <div className="text-xs ascii-dim mt-2">
                                    Public Hash: <span className="font-mono select-all">{user.ip_hash}</span>
                                </div>
                            )}

                            {/* Security Data (Admin Only) */}
                            {securityData && (
                                <div className="pt-3 mt-4 border-t border-ascii-border/50 bg-red-950/20 p-3 rounded border border-red-500/20">
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
                                                                p_target_type: 'user',
                                                                p_target_id: user.id,
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
                                            <div className="font-mono text-xs text-ascii-dim truncate" title={securityData.ip_fingerprint || ''}>
                                                {securityData.ip_fingerprint?.substring(0, 16)}...
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
                    </div>

                    {/* IP Content Modal */}
                    {securityData?.real_ip && (
                        <IPContentModal
                            isOpen={!!showIPContent}
                            onClose={() => setShowIPContent(null)}
                            ipAddress={securityData.real_ip}
                            type={showIPContent || 'posts'}
                        />
                    )}

                    {/* Timeline */}
                    <div className="ascii-box p-4">
                        <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                            <Hash className="w-4 h-4" />
                            USER ACTIVITY TIMELINE
                        </h3>
                        <UserTimeline userId={user.id} />
                    </div>
                </div>
            </div>
        </div>
    );
}
