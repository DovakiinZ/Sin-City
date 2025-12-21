import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    UserX,
    Users as UsersIcon,
    Shield,
    ShieldOff,
    Eye,
    Flag,
    Ban,
    CheckCircle,
    AlertTriangle,
    Mail,
    Clock,
    Hash,
    Monitor,
    MessageSquare
} from "lucide-react";
import GuestDetailModal from "./GuestDetailModal";

interface Guest {
    id: string;
    fingerprint: string;
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
    };
    trust_score: number;
    flags: string[];
    status: 'active' | 'blocked' | 'restricted';
    first_seen_at: string;
    last_seen_at: string;
    blocked_at: string | null;
    notes: string | null;
}

interface GuestStats {
    total_guests: number;
    active_guests: number;
    blocked_guests: number;
    restricted_guests: number;
    total_guest_posts: number;
    guests_with_email: number;
}

export default function GuestManagement() {
    const [guests, setGuests] = useState<Guest[]>([]);
    const [stats, setStats] = useState<GuestStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        loadGuests();
        loadStats();
    }, []);

    const loadGuests = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("guests")
                .select("*")
                .order("last_seen_at", { ascending: false });

            if (error) throw error;
            setGuests(data || []);
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to load guests: " + error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const { data, error } = await supabase.rpc('get_guest_stats');
            if (error) throw error;
            setStats(data?.[0] || null);
        } catch (error: any) {
            console.error('Error loading guest stats:', error);
        }
    };

    const handleStatusChange = async (guestId: string, newStatus: 'active' | 'blocked' | 'restricted') => {
        const guest = guests.find(g => g.id === guestId);
        const action = newStatus === 'blocked' ? 'block' : newStatus === 'restricted' ? 'restrict' : 'unblock';

        if (!confirm(`Are you sure you want to ${action} this guest?`)) {
            return;
        }

        try {
            const updateData: any = {
                status: newStatus,
            };

            if (newStatus === 'blocked') {
                updateData.blocked_at = new Date().toISOString();
            } else {
                updateData.blocked_at = null;
            }

            const { error } = await supabase
                .from("guests")
                .update(updateData)
                .eq("id", guestId);

            if (error) throw error;

            toast({
                title: "Success",
                description: `Guest ${action}ed successfully`,
            });

            loadGuests();
            loadStats();
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to update status: " + error.message,
                variant: "destructive",
            });
        }
    };

    const handleToggleFlag = async (guestId: string, flag: string) => {
        const guest = guests.find(g => g.id === guestId);
        if (!guest) return;

        const hasFlag = guest.flags.includes(flag);
        const newFlags = hasFlag
            ? guest.flags.filter(f => f !== flag)
            : [...guest.flags, flag];

        try {
            const { error } = await supabase
                .from("guests")
                .update({ flags: newFlags })
                .eq("id", guestId);

            if (error) throw error;

            toast({
                title: "Success",
                description: `Flag ${hasFlag ? 'removed' : 'added'} successfully`,
            });

            loadGuests();
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to update flags: " + error.message,
                variant: "destructive",
            });
        }
    };

    const openGuestDetail = (guest: Guest) => {
        setSelectedGuest(guest);
        setShowDetailModal(true);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                        <CheckCircle className="w-3 h-3" />
                        ACTIVE
                    </span>
                );
            case 'blocked':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
                        <Ban className="w-3 h-3" />
                        BLOCKED
                    </span>
                );
            case 'restricted':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        <AlertTriangle className="w-3 h-3" />
                        RESTRICTED
                    </span>
                );
            default:
                return null;
        }
    };

    const getTrustScoreColor = (score: number) => {
        if (score >= 70) return 'text-green-400';
        if (score >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    const truncateFingerprint = (fp: string) => {
        return fp.length > 8 ? `${fp.substring(0, 8)}...` : fp;
    };

    if (loading) {
        return (
            <div className="ascii-box p-8 text-center ascii-dim">
                Loading guest data...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">TOTAL GUESTS</div>
                    <div className="text-2xl ascii-highlight">{stats?.total_guests || 0}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">ACTIVE</div>
                    <div className="text-2xl text-green-400">{stats?.active_guests || 0}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">BLOCKED</div>
                    <div className="text-2xl text-red-400">{stats?.blocked_guests || 0}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">RESTRICTED</div>
                    <div className="text-2xl text-yellow-400">{stats?.restricted_guests || 0}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">GUEST POSTS</div>
                    <div className="text-2xl ascii-highlight">{stats?.total_guest_posts || 0}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">WITH EMAIL</div>
                    <div className="text-2xl ascii-highlight">{stats?.guests_with_email || 0}</div>
                </div>
            </div>

            {/* Guest List */}
            <div className="ascii-box p-4 overflow-x-auto">
                <div className="flex items-center gap-2 mb-4">
                    <UserX className="w-5 h-5 ascii-highlight" />
                    <h3 className="ascii-highlight text-lg">Guest Management</h3>
                </div>

                <table className="w-full text-sm text-left">
                    <thead className="ascii-dim border-b border-ascii-border">
                        <tr>
                            <th className="p-2">Fingerprint</th>
                            <th className="p-2">Email</th>
                            <th className="p-2">Posts</th>
                            <th className="p-2">Trust</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Last Seen</th>
                            <th className="p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {guests.map((guest) => (
                            <tr key={guest.id} className="border-b border-ascii-border/50 hover:bg-white/5">
                                <td className="p-2 font-mono">
                                    <button
                                        onClick={() => openGuestDetail(guest)}
                                        className="hover:text-ascii-highlight transition-colors flex items-center gap-1"
                                        title={guest.fingerprint}
                                    >
                                        <Hash className="w-3 h-3" />
                                        {truncateFingerprint(guest.fingerprint)}
                                    </button>
                                </td>
                                <td className="p-2">
                                    {guest.email ? (
                                        <span className="flex items-center gap-1">
                                            <Mail className="w-3 h-3" />
                                            {guest.email}
                                            {guest.email_verified && (
                                                <span title="Verified">
                                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="ascii-dim">N/A</span>
                                    )}
                                </td>
                                <td className="p-2">
                                    <span className="flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" />
                                        {guest.post_count}
                                    </span>
                                </td>
                                <td className="p-2">
                                    <span className={`font-mono ${getTrustScoreColor(guest.trust_score)}`}>
                                        {guest.trust_score}%
                                    </span>
                                </td>
                                <td className="p-2">
                                    {getStatusBadge(guest.status)}
                                </td>
                                <td className="p-2">
                                    <span className="flex items-center gap-1 text-xs ascii-dim">
                                        <Clock className="w-3 h-3" />
                                        {new Date(guest.last_seen_at).toLocaleDateString()}
                                    </span>
                                </td>
                                <td className="p-2">
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openGuestDetail(guest)}
                                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                            title="View Details"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Button>

                                        {guest.status === 'active' ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleStatusChange(guest.id, 'restricted')}
                                                    className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20"
                                                    title="Restrict"
                                                >
                                                    <AlertTriangle className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleStatusChange(guest.id, 'blocked')}
                                                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                    title="Block"
                                                >
                                                    <Ban className="w-4 h-4" />
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleStatusChange(guest.id, 'active')}
                                                className="text-green-400 hover:text-green-300 hover:bg-green-900/20"
                                                title="Unblock"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </Button>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleToggleFlag(guest.id, 'spam')}
                                            className={`${guest.flags.includes('spam') ? 'text-red-400' : 'text-gray-400'} hover:text-red-300 hover:bg-red-900/20`}
                                            title={guest.flags.includes('spam') ? 'Remove spam flag' : 'Flag as spam'}
                                        >
                                            <Flag className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {guests.length === 0 && (
                    <div className="text-center py-8 ascii-dim">
                        No guests found
                    </div>
                )}
            </div>

            {/* Flags Legend */}
            <div className="ascii-box p-4">
                <div className="ascii-dim text-xs mb-2">FLAGS LEGEND</div>
                <div className="flex flex-wrap gap-4 text-xs">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        spam - Flagged as spam
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                        suspicious - Suspicious activity
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-400"></span>
                        trusted - Manually trusted
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        new - New guest
                    </span>
                </div>
            </div>

            {/* Guest Detail Modal */}
            {showDetailModal && selectedGuest && (
                <GuestDetailModal
                    guest={selectedGuest}
                    onClose={() => {
                        setShowDetailModal(false);
                        setSelectedGuest(null);
                    }}
                    onUpdate={() => {
                        loadGuests();
                        loadStats();
                    }}
                />
            )}
        </div>
    );
}
