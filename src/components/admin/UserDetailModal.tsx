import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    X, Hash, Mail, Shield, Eye, EyeOff, Wifi, MapPin, Calendar,
    BarChart3, Users, MessageSquare, Heart, FileText, Clock,
    AlertTriangle, Link2, StickyNote, Zap, Send
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
    securityData?: { real_ip: string; ip_hash: string; last_seen_at: string; is_blocked?: boolean } | null;
}

interface UserDetailModalProps {
    user: UserProfile;
    onClose: () => void;
    onUpdate: () => void;
}

interface EngagementStats {
    posts: number;
    comments: number;
    reactions_given: number;
    reactions_received: number;
    avg_post_length: number;
    dm_messages: number;
    last_active: string | null;
    most_active_hour: number | null;
    account_age_days: number;
}

interface RiskScore {
    score: number;
    level: 'safe' | 'low' | 'warning' | 'critical';
    factors: { factor: string; points: number; severity: string }[];
}

interface AltAccounts {
    identity_links: any[];
    same_ip_users: { user_id: string; username: string; role: string; last_seen: string }[];
    total_alts: number;
}

interface AdminNote {
    id: string;
    content: string;
    admin_username: string;
    created_at: string;
}

export default function UserDetailModal({ user, onClose, onUpdate }: UserDetailModalProps) {
    const { toast } = useToast();
    const [securityData, setSecurityData] = useState<any>(user.securityData ? { ...user.securityData } : null);
    const [showIPContent, setShowIPContent] = useState<'posts' | 'comments' | null>(null);
    const [showRealIP, setShowRealIP] = useState(false);
    const [engagement, setEngagement] = useState<EngagementStats | null>(null);
    const [risk, setRisk] = useState<RiskScore | null>(null);
    const [alts, setAlts] = useState<AltAccounts | null>(null);
    const [notes, setNotes] = useState<AdminNote[]>([]);
    const [newNote, setNewNote] = useState('');
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        loadAllData();
    }, [user.id]);

    const loadAllData = async () => {
        const results = await Promise.allSettled([
            loadSecurityData(),
            supabase.rpc('get_user_engagement_stats', { p_user_id: user.id }),
            supabase.rpc('get_user_risk_score', { p_user_id: user.id }),
            supabase.rpc('get_user_alt_accounts', { p_user_id: user.id }),
            supabase.rpc('get_admin_notes', { p_target_id: user.id, p_target_type: 'user' }),
        ]);

        if (results[1].status === 'fulfilled' && results[1].value.data) setEngagement(results[1].value.data);
        if (results[2].status === 'fulfilled' && results[2].value.data) setRisk(results[2].value.data);
        if (results[3].status === 'fulfilled' && results[3].value.data) setAlts(results[3].value.data);
        if (results[4].status === 'fulfilled' && results[4].value.data) setNotes(results[4].value.data);
    };

    const loadSecurityData = async () => {
        const { data } = await supabase
            .from('ip_security_logs')
            .select('real_ip, ip_hash, last_seen_at')
            .eq('user_id', user.id)
            .order('last_seen_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (data) {
            const [blockedRes, statsRes] = await Promise.allSettled([
                supabase.rpc('is_ip_blocked', { p_ip: data.real_ip }),
                supabase.rpc('get_ip_content_stats', { p_ip: data.real_ip }),
            ]);
            setSecurityData({
                ...data,
                is_blocked: blockedRes.status === 'fulfilled' ? blockedRes.value.data : false,
                stats: statsRes.status === 'fulfilled' ? statsRes.value.data : null,
            });
        }
    };

    const handleBlockIP = async () => {
        if (!securityData?.real_ip) return;
        const action = securityData.is_blocked ? 'unblock_ip' : 'block_ip';
        if (!confirm(`${securityData.is_blocked ? 'Unblock' : 'Block'} IP ${securityData.real_ip}?`)) return;

        const { error } = securityData.is_blocked
            ? await supabase.rpc('unblock_ip', { p_ip: securityData.real_ip })
            : await supabase.rpc('block_ip', { p_ip: securityData.real_ip, p_reason: `Admin (user: ${user.id})` });

        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
        toast({ title: securityData.is_blocked ? "IP Unblocked" : "IP Blocked" });
        loadSecurityData();
        onUpdate();
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        const { error } = await supabase.rpc('add_admin_note', {
            p_target_id: user.id, p_target_type: 'user', p_content: newNote.trim()
        });
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
        setNewNote('');
        const { data } = await supabase.rpc('get_admin_notes', { p_target_id: user.id, p_target_type: 'user' });
        if (data) setNotes(data);
        toast({ title: "Note added" });
    };

    const handleQuickAction = async (action: string) => {
        if (!confirm(`Apply "${action}" to ${user.username}?`)) return;
        const { data, error } = await supabase.rpc('admin_restrict_user', { p_user_id: user.id, p_action: action });
        if (error || !data?.success) {
            toast({ title: "Error", description: error?.message || data?.error, variant: "destructive" });
            return;
        }
        toast({ title: "Done", description: `${action} applied to ${user.username}` });
        onUpdate();
    };

    const riskColor = (level: string) => {
        if (level === 'critical') return 'text-red-400 border-red-500/30 bg-red-500/10';
        if (level === 'warning') return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
        if (level === 'low') return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
        return 'text-green-400 border-green-500/30 bg-green-500/10';
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-3 h-3" /> },
        { id: 'network', label: 'Network', icon: <Wifi className="w-3 h-3" /> },
        { id: 'alts', label: `Alts${alts?.total_alts ? ` (${alts.total_alts})` : ''}`, icon: <Link2 className="w-3 h-3" /> },
        { id: 'notes', label: `Notes${notes.length ? ` (${notes.length})` : ''}`, icon: <StickyNote className="w-3 h-3" /> },
        { id: 'timeline', label: 'Timeline', icon: <Clock className="w-3 h-3" /> },
        { id: 'actions', label: 'Actions', icon: <Zap className="w-3 h-3" /> },
    ];

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="ascii-box bg-background max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ascii-border sticky top-0 bg-background z-10">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="ascii-highlight text-lg flex items-center gap-2">
                            <Hash className="w-5 h-5" /> {user.username}
                        </h2>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${user.role === 'admin' ? 'text-red-400 border-red-500/30' : 'text-green-400 border-green-500/30'}`}>
                            {user.role}
                        </span>
                        {risk && (
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${riskColor(risk.level)}`}>
                                RISK: {risk.score} ({risk.level})
                            </span>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}><X className="w-5 h-5" /></Button>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 px-4 pt-3 pb-1 border-b border-ascii-border overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono whitespace-nowrap border transition-colors ${
                                activeTab === tab.id
                                    ? 'border-green-500 text-green-400 bg-green-500/10'
                                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-4">
                    {/* ════════════════ OVERVIEW TAB ════════════════ */}
                    {activeTab === 'overview' && (
                        <div className="space-y-4">
                            {/* Identity Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="ascii-box p-3">
                                    <div className="ascii-dim text-[10px] mb-1 flex items-center gap-1"><Hash className="w-3 h-3" />USER ID</div>
                                    <div className="font-mono text-[10px] break-all select-all">{user.id}</div>
                                </div>
                                <div className="ascii-box p-3">
                                    <div className="ascii-dim text-[10px] mb-1 flex items-center gap-1"><Mail className="w-3 h-3" />EMAIL</div>
                                    <div className="text-xs select-all">{user.email || 'Hidden'}</div>
                                </div>
                                <div className="ascii-box p-3">
                                    <div className="ascii-dim text-[10px] mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" />JOINED</div>
                                    <div className="text-xs">{new Date(user.created_at).toLocaleDateString()}</div>
                                </div>
                                <div className="ascii-box p-3">
                                    <div className="ascii-dim text-[10px] mb-1">ACCOUNT AGE</div>
                                    <div className="text-xs font-bold ascii-highlight">{engagement?.account_age_days ?? '—'} days</div>
                                </div>
                            </div>

                            {/* Engagement Stats */}
                            {engagement && (
                                <div className="ascii-box p-4">
                                    <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4" /> ENGAGEMENT
                                    </h3>
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                                        {[
                                            { val: engagement.posts, label: 'Posts', icon: <FileText className="w-3 h-3" />, color: 'ascii-highlight' },
                                            { val: engagement.comments, label: 'Comments', icon: <MessageSquare className="w-3 h-3" />, color: 'text-blue-400' },
                                            { val: engagement.reactions_given, label: 'Likes Given', icon: <Heart className="w-3 h-3" />, color: 'text-pink-400' },
                                            { val: engagement.reactions_received, label: 'Likes Got', icon: <Heart className="w-3 h-3" />, color: 'text-purple-400' },
                                            { val: engagement.dm_messages, label: 'DMs', icon: <Send className="w-3 h-3" />, color: 'text-cyan-400' },
                                            { val: engagement.avg_post_length, label: 'Avg Length', icon: null, color: 'text-yellow-400' },
                                        ].map((s, i) => (
                                            <div key={i} className="text-center">
                                                <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
                                                <div className="text-[10px] ascii-dim flex items-center justify-center gap-1">{s.icon}{s.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between mt-3 pt-2 border-t border-ascii-border/30 text-[10px] ascii-dim">
                                        <span>Last active: {engagement.last_active ? new Date(engagement.last_active).toLocaleString() : 'Never'}</span>
                                        <span>Peak hour: {engagement.most_active_hour !== null ? `${engagement.most_active_hour}:00` : 'N/A'}</span>
                                    </div>
                                </div>
                            )}

                            {/* Risk Assessment */}
                            {risk && risk.factors.length > 0 && (
                                <div className={`ascii-box p-4 border ${riskColor(risk.level)}`}>
                                    <h3 className="text-sm border-b border-current/20 pb-2 mb-3 flex items-center gap-2 font-bold">
                                        <AlertTriangle className="w-4 h-4" /> RISK: {risk.score}/100 — {risk.level.toUpperCase()}
                                    </h3>
                                    <div className="space-y-1">
                                        {risk.factors.map((f, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-2">
                                                    <span className={f.severity === 'trust' ? 'text-green-400' : f.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}>
                                                        {f.severity === 'trust' ? '✓' : '⚠'}
                                                    </span>
                                                    {f.factor}
                                                </span>
                                                <span className={`font-mono ${f.points > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                    {f.points > 0 ? '+' : ''}{f.points}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════════════════ NETWORK TAB ════════════════ */}
                    {activeTab === 'network' && (
                        <div className="space-y-4">
                            <div className="ascii-box p-4">
                                <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                                    <Wifi className="w-4 h-4" /> NETWORK INFO
                                </h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <div className="ascii-dim text-xs">Location</div>
                                        <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{user.city || 'Unknown'}, {user.country || 'Unknown'}</div>
                                    </div>
                                    <div>
                                        <div className="ascii-dim text-xs">ISP</div>
                                        <div>{user.isp || 'Unknown'}</div>
                                    </div>
                                    <div>
                                        <div className="ascii-dim text-xs">VPN</div>
                                        <div className={user.vpn_detected ? 'text-red-400' : 'text-green-400'}>{user.vpn_detected ? '⚠ YES' : 'No'}</div>
                                    </div>
                                    <div>
                                        <div className="ascii-dim text-xs">Tor</div>
                                        <div className={user.tor_detected ? 'text-red-400' : 'text-green-400'}>{user.tor_detected ? '⚠ YES' : 'No'}</div>
                                    </div>
                                </div>
                                {user.ip_hash && <div className="text-xs ascii-dim mt-3 font-mono">Hash: {user.ip_hash}</div>}
                            </div>

                            {securityData && (
                                <div className="bg-red-950/20 p-4 border border-red-500/20 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-red-300 font-bold flex items-center gap-2"><Shield className="w-3 h-3" /> SECURE ADMIN DATA</span>
                                        <Button variant="outline" size="sm" className="h-6 text-[10px] border-red-500/50 text-red-400" onClick={handleBlockIP}>
                                            {securityData.is_blocked ? 'UNBLOCK IP' : 'BLOCK IP'}
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <div className="ascii-dim text-[10px] flex items-center gap-2">
                                                Real IP
                                                <button onClick={() => setShowRealIP(!showRealIP)} className="text-gray-500 hover:text-white">
                                                    {showRealIP ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                </button>
                                            </div>
                                            <div className={`font-mono text-sm ${securityData.is_blocked ? 'text-red-500 line-through' : 'text-red-200'}`}>
                                                {showRealIP ? securityData.real_ip : securityData.real_ip?.replace(/\.\d+\.\d+$/, '.***.***')}
                                            </div>
                                            {securityData.is_blocked && <span className="text-[10px] text-red-500 font-bold">BLOCKED</span>}
                                        </div>
                                        <div>
                                            <div className="ascii-dim text-[10px]">Fingerprint</div>
                                            <div className="font-mono text-xs ascii-dim">{securityData.ip_hash?.substring(0, 20)}...</div>
                                        </div>
                                    </div>
                                    {securityData.stats && (
                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-red-500/20">
                                            <Button variant="ghost" className="h-auto py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 flex flex-col items-center" onClick={() => setShowIPContent('posts')}>
                                                <span className="text-lg font-bold text-red-200">{securityData.stats.post_count}</span>
                                                <span className="text-[10px] text-red-300">Posts from IP</span>
                                            </Button>
                                            <Button variant="ghost" className="h-auto py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 flex flex-col items-center" onClick={() => setShowIPContent('comments')}>
                                                <span className="text-lg font-bold text-red-200">{securityData.stats.comment_count}</span>
                                                <span className="text-[10px] text-red-300">Comments from IP</span>
                                            </Button>
                                        </div>
                                    )}
                                    <div className="text-[10px] text-right text-red-500/40 font-mono">Last: {new Date(securityData.last_seen_at).toLocaleString()}</div>
                                </div>
                            )}
                            {securityData?.real_ip && <IPContentModal isOpen={!!showIPContent} onClose={() => setShowIPContent(null)} ipAddress={securityData.real_ip} type={showIPContent || 'posts'} />}
                        </div>
                    )}

                    {/* ════════════════ ALTS TAB ════════════════ */}
                    {activeTab === 'alts' && (
                        <div className="ascii-box p-4">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                                <Link2 className="w-4 h-4" /> ALT ACCOUNT DETECTION
                            </h3>

                            {alts && alts.same_ip_users.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="text-xs text-yellow-400 mb-2">⚠ Users sharing same IP:</div>
                                    {alts.same_ip_users.map((u) => (
                                        <div key={u.user_id} className="flex items-center justify-between ascii-box p-2">
                                            <div className="flex items-center gap-2">
                                                <Users className="w-3 h-3 text-yellow-400" />
                                                <span className="font-mono text-sm">{u.username}</span>
                                                <span className={`text-[10px] px-1 border ${u.role === 'admin' ? 'text-red-400 border-red-500/30' : 'text-green-400 border-green-500/30'}`}>{u.role}</span>
                                            </div>
                                            <span className="text-[10px] ascii-dim">{u.last_seen ? new Date(u.last_seen).toLocaleDateString() : ''}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 ascii-dim text-sm">No alt accounts detected via IP matching</div>
                            )}

                            {alts && alts.identity_links.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-ascii-border">
                                    <div className="text-xs ascii-dim mb-2">Identity Links (fingerprint/guest sessions):</div>
                                    {alts.identity_links.map((link: any) => (
                                        <div key={link.id} className="flex items-center justify-between text-xs ascii-box p-2 mb-1">
                                            <span className="font-mono">{link.other_id?.substring(0, 24)}... <span className="ascii-dim">({link.other_type})</span></span>
                                            <span className={`px-2 py-0.5 border font-mono ${
                                                link.confidence >= 71 ? 'text-green-400 border-green-500/30' :
                                                link.confidence >= 41 ? 'text-yellow-400 border-yellow-500/30' :
                                                'text-red-400 border-red-500/30'
                                            }`}>
                                                {link.confidence}% {link.link_type}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════════════════ NOTES TAB ════════════════ */}
                    {activeTab === 'notes' && (
                        <div className="ascii-box p-4">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                                <StickyNote className="w-4 h-4" /> ADMIN NOTES
                            </h3>
                            <div className="flex gap-2 mb-4">
                                <input
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                                    placeholder="Add internal note..."
                                    className="flex-1 bg-black border border-green-500/30 text-green-400 px-3 py-2 text-sm font-mono focus:outline-none focus:border-green-400"
                                />
                                <Button onClick={handleAddNote} variant="outline" size="sm" className="border-green-500/30 text-green-400 hover:bg-green-500/10">Add</Button>
                            </div>
                            {notes.length > 0 ? (
                                <div className="space-y-2">
                                    {notes.map((note) => (
                                        <div key={note.id} className="ascii-box p-3">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-yellow-400 text-xs font-bold">{note.admin_username}</span>
                                                <span className="text-[10px] ascii-dim">{new Date(note.created_at).toLocaleString()}</span>
                                            </div>
                                            <div className="text-sm text-gray-300">{note.content}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 ascii-dim text-sm">No notes yet. Add one above.</div>
                            )}
                        </div>
                    )}

                    {/* ════════════════ TIMELINE TAB ════════════════ */}
                    {activeTab === 'timeline' && (
                        <div className="ascii-box p-4">
                            <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> ACTIVITY TIMELINE
                            </h3>
                            <UserTimeline userId={user.id} />
                        </div>
                    )}

                    {/* ════════════════ ACTIONS TAB ════════════════ */}
                    {activeTab === 'actions' && (
                        <div className="space-y-4">
                            <div className="ascii-box p-4">
                                <h3 className="ascii-highlight text-sm border-b border-ascii-border pb-2 mb-3 flex items-center gap-2">
                                    <Zap className="w-4 h-4" /> MODERATION ACTIONS
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button onClick={() => handleQuickAction('shadow_mute')} variant="outline" className="justify-start h-auto py-3 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10">
                                        <EyeOff className="w-4 h-4 mr-2 shrink-0" />
                                        <div className="text-left">
                                            <div className="text-sm font-bold">Shadow Mute</div>
                                            <div className="text-[10px] opacity-60 font-normal">Posts visible only to them</div>
                                        </div>
                                    </Button>
                                    <Button onClick={() => handleQuickAction('unshadow_mute')} variant="outline" className="justify-start h-auto py-3 border-green-500/30 text-green-400 hover:bg-green-500/10">
                                        <Eye className="w-4 h-4 mr-2 shrink-0" />
                                        <div className="text-left">
                                            <div className="text-sm font-bold">Remove Mute</div>
                                            <div className="text-[10px] opacity-60 font-normal">Restore visibility</div>
                                        </div>
                                    </Button>
                                    <Button onClick={() => handleQuickAction('restrict')} variant="outline" className="justify-start h-auto py-3 border-red-500/30 text-red-400 hover:bg-red-500/10">
                                        <Shield className="w-4 h-4 mr-2 shrink-0" />
                                        <div className="text-left">
                                            <div className="text-sm font-bold">Restrict</div>
                                            <div className="text-[10px] opacity-60 font-normal">Block posting & commenting</div>
                                        </div>
                                    </Button>
                                    <Button onClick={() => handleQuickAction('unrestrict')} variant="outline" className="justify-start h-auto py-3 border-green-500/30 text-green-400 hover:bg-green-500/10">
                                        <Shield className="w-4 h-4 mr-2 shrink-0" />
                                        <div className="text-left">
                                            <div className="text-sm font-bold">Unrestrict</div>
                                            <div className="text-[10px] opacity-60 font-normal">Restore full access</div>
                                        </div>
                                    </Button>
                                </div>
                            </div>

                            {securityData?.real_ip && (
                                <div className="ascii-box p-4 border-red-500/20">
                                    <h3 className="text-sm text-red-400 font-bold mb-3 flex items-center gap-2"><Wifi className="w-4 h-4" /> IP ACTION</h3>
                                    <Button onClick={handleBlockIP} variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 w-full">
                                        {securityData.is_blocked ? 'Unblock' : 'Block'} IP: {showRealIP ? securityData.real_ip : securityData.real_ip?.replace(/\.\d+\.\d+$/, '.***.***')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
