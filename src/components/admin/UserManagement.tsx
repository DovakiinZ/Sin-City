import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Shield, ShieldOff, Users as UsersIcon, Globe, Wifi, AlertTriangle, Eye, ArrowDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import UserDetailModal from "./UserDetailModal";

interface UserProfile {
    id: string;
    username: string;
    email?: string; // Added email
    role: string;
    created_at: string;
    country?: string | null;
    city?: string | null;
    ip_hash?: string | null;
    isp?: string | null;
    vpn_detected?: boolean;
    tor_detected?: boolean;
    last_ip_update?: string | null;
    last_seen?: string | null;        // last time the user had the site open
    last_sign_in_at?: string | null;  // last time the user signed in
    ip_count?: number;
    securityData?: { real_ip: string; ip_hash: string; last_seen_at: string; is_blocked?: boolean } | null;
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function ago(iso?: string | null): string {
    if (!iso) return 'Never';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 'Never';
    return formatDistanceToNow(t, { addSuffix: true });
}

function exact(iso?: string | null): string {
    return iso ? new Date(iso).toLocaleString() : 'No record';
}

export default function UserManagement() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            // Blocked IPs
            const { data: blockedIps } = await supabase
                .from("blocked_ips")
                .select("ip_address");
            const blockedSet = new Set((blockedIps || []).map(b => b.ip_address));

            // Preferred: one admin RPC with last activity, last login and the
            // most recent server-recorded IP per user.
            const { data: rows, error: rpcError } = await supabase.rpc('get_users_with_activity');

            let mergedUsers: UserProfile[];
            if (!rpcError) {
                mergedUsers = (rows || []).map((user: any) => ({
                    ...user,
                    securityData: user.last_ip ? {
                        real_ip: user.last_ip,
                        ip_hash: user.ip_hash,
                        last_seen_at: user.last_ip_seen_at,
                        is_blocked: blockedSet.has(user.last_ip)
                    } : null
                }));
            } else {
                // Fallback until supabase/2026-11-26-last-activity-vpn-gate.sql has been run.
                console.warn('[UserManagement] get_users_with_activity unavailable, using legacy query:', rpcError.message);
                const { data: profiles, error: profileError } = await supabase
                    .rpc('get_users_with_email');
                if (profileError) throw profileError;

                const { data: securityLogs } = await supabase
                    .from("ip_security_logs")
                    .select("user_id, real_ip, ip_hash, last_seen_at")
                    .not('user_id', 'is', null)
                    .order('last_seen_at', { ascending: false });

                mergedUsers = (profiles || []).map((user: any) => {
                    // Logs are newest-first, so the first match is the latest IP.
                    const logs = securityLogs?.find(log => log.user_id === user.id);
                    return {
                        ...user,
                        securityData: logs ? {
                            real_ip: logs.real_ip,
                            ip_hash: logs.ip_hash,
                            last_seen_at: logs.last_seen_at,
                            is_blocked: blockedSet.has(logs.real_ip)
                        } : null
                    };
                });
            }

            setUsers(mergedUsers);
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to load users: " + error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBlockIP = async (ip: string, username: string) => {
        if (!confirm(`Are you sure you want to BLOCK IP ${ip} for user ${username}?`)) return;

        try {
            const { error } = await supabase.rpc('block_ip', {
                p_ip: ip,
                p_reason: `Blocked via User Admin (User: ${username})`
            });

            if (error) throw error;

            toast({ title: "IP Blocked", description: `IP for ${username} blocked successfully.` });
            loadUsers();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const handleUnblockIP = async (ip: string) => {
        if (!confirm(`Unblock IP ${ip}?`)) return;

        try {
            const { error } = await supabase.rpc('unblock_ip', { p_ip: ip });

            if (error) throw error;

            toast({ title: "IP Unblocked", description: "IP unblocked successfully." });
            loadUsers();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        const user = users.find(u => u.id === userId);
        const action = newRole === 'admin' ? 'promote' : 'demote';

        if (!confirm(`Are you sure you want to ${action} ${user?.username} to ${newRole}?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from("profiles")
                .update({ role: newRole })
                .eq("id", userId);

            if (error) throw error;

            toast({
                title: "Success",
                description: `User ${action}d to ${newRole} successfully`,
            });

            // Reload users to reflect changes
            loadUsers();
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to update role: " + error.message,
                variant: "destructive",
            });
        }
    };

    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [sortBy, setSortBy] = useState<'joined' | 'active'>('active');

    const adminCount = users.filter(u => u.role === 'admin').length;
    const ts = (iso?: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);
    const isOnline = (u: UserProfile) => Date.now() - ts(u.last_seen) < ONLINE_WINDOW_MS;
    const onlineCount = users.filter(isOnline).length;
    const sortedUsers = [...users].sort((a, b) => sortBy === 'active'
        ? ts(b.last_seen) - ts(a.last_seen)
        : ts(b.created_at) - ts(a.created_at));

    // ... (keep useEffect and loading logic)

    // ... (keep handleBlockIP, etc.)

    if (loading) {
        return (
            <div className="ascii-box p-8 text-center ascii-dim">
                Loading user data...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">TOTAL USERS</div>
                    <div className="text-2xl ascii-highlight">{users.length}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">ADMINS</div>
                    <div className="text-2xl ascii-highlight text-yellow-500">{adminCount}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">REGULAR USERS</div>
                    <div className="text-2xl ascii-highlight">{users.length - adminCount}</div>
                </div>
                <div className="ascii-box p-4">
                    <div className="ascii-dim text-xs mb-1">ONLINE NOW</div>
                    <div className="text-2xl ascii-highlight text-green-400">{onlineCount}</div>
                </div>
            </div>

            {/* User List */}
            <div className="ascii-box p-4 overflow-x-auto">
                <div className="flex items-center gap-2 mb-4">
                    <UsersIcon className="w-5 h-5 ascii-highlight" />
                    <h3 className="ascii-highlight text-lg">User Management</h3>
                </div>

                <table className="w-full text-sm text-left">
                    <thead className="ascii-dim border-b border-ascii-border">
                        <tr>
                            <th className="p-2">Username</th>
                            <th className="p-2">Email</th>
                            <th className="p-2">Role</th>
                            <th className="p-2 whitespace-nowrap">
                                <button
                                    onClick={() => setSortBy('active')}
                                    className={`inline-flex items-center gap-1 hover:text-green-400 ${sortBy === 'active' ? 'text-green-400' : ''}`}
                                    title="Sort by last active, newest first"
                                >
                                    Last Active{sortBy === 'active' && <ArrowDown className="w-3 h-3" />}
                                </button>
                            </th>
                            <th className="p-2 whitespace-nowrap">Last Login</th>
                            <th className="p-2">Location</th>
                            <th className="p-2">Secure IP (Admin)</th>
                            <th className="p-2">Network</th>
                            <th className="p-2 whitespace-nowrap">
                                <button
                                    onClick={() => setSortBy('joined')}
                                    className={`inline-flex items-center gap-1 hover:text-green-400 ${sortBy === 'joined' ? 'text-green-400' : ''}`}
                                    title="Sort by joined, newest first"
                                >
                                    Joined{sortBy === 'joined' && <ArrowDown className="w-3 h-3" />}
                                </button>
                            </th>
                            <th className="p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user) => (
                            <tr key={user.id} className="border-b border-ascii-border/50 hover:bg-white/5">
                                <td className="p-2 font-mono">
                                    <button
                                        onClick={() => setSelectedUser(user)}
                                        className="text-left hover:text-green-400 hover:underline"
                                    >
                                        {user.username || 'N/A'}
                                    </button>
                                </td>
                                <td className="p-2 text-xs text-gray-400 select-all">{user.email || 'N/A'}</td>
                                <td className="p-2">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${user.role === 'admin'
                                        ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                        }`}>
                                        {user.role === 'admin' ? (
                                            <Shield className="w-3 h-3" />
                                        ) : (
                                            <ShieldOff className="w-3 h-3" />
                                        )}
                                        {user.role.toUpperCase()}
                                    </span>
                                </td>
                                <td className="p-2 whitespace-nowrap" title={exact(user.last_seen)}>
                                    {isOnline(user) ? (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-green-400">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            Online now
                                        </span>
                                    ) : (
                                        <div className="flex flex-col">
                                            <span className={`text-xs ${user.last_seen ? '' : 'text-gray-600'}`}>{ago(user.last_seen)}</span>
                                            {user.last_seen && (
                                                <span className="text-[10px] ascii-dim">{exact(user.last_seen)}</span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="p-2 whitespace-nowrap" title={exact(user.last_sign_in_at)}>
                                    <div className="flex flex-col">
                                        <span className={`text-xs ${user.last_sign_in_at ? '' : 'text-gray-600'}`}>{ago(user.last_sign_in_at)}</span>
                                        {user.last_sign_in_at && (
                                            <span className="text-[10px] ascii-dim">{exact(user.last_sign_in_at)}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-2">
                                    {user.country ? (
                                        <div className="flex items-center gap-1">
                                            <Globe className="w-3 h-3 text-green-500" />
                                            <span className="text-xs">
                                                {user.city ? `${user.city}, ` : ''}{user.country}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-600 text-xs">--</span>
                                    )}
                                </td>
                                <td className="p-2">
                                    {user.securityData ? (
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setSelectedUser(user)}
                                                    className={`hover:underline font-mono font-bold text-xs select-all ${user.securityData.is_blocked ? 'text-red-500 line-through' : 'text-red-300'}`}
                                                >
                                                    {user.securityData.real_ip}
                                                </button>
                                                {user.securityData.is_blocked && (
                                                    <span className="text-[10px] text-red-500 font-bold">BLOCKED</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] ascii-dim whitespace-nowrap" title={exact(user.securityData.last_seen_at)}>
                                                seen {ago(user.securityData.last_seen_at)}
                                                {(user.ip_count ?? 0) > 1 ? ` · ${user.ip_count} IPs` : ''}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-600 text-xs italic">Not logged yet</span>
                                    )}
                                </td>
                                <td className="p-2">
                                    <div className="flex items-center gap-1">
                                        {user.vpn_detected && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px]">
                                                <Wifi className="w-2.5 h-2.5" />
                                                VPN
                                            </span>
                                        )}
                                        {user.tor_detected && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px]">
                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                TOR
                                            </span>
                                        )}
                                        {!user.vpn_detected && !user.tor_detected && user.isp && (
                                            <span className="text-gray-500 text-[10px] truncate max-w-[100px]" title={user.isp}>
                                                {user.isp}
                                            </span>
                                        )}
                                        {!user.vpn_detected && !user.tor_detected && !user.isp && (
                                            <span className="text-gray-600 text-xs">--</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-2">{new Date(user.created_at).toLocaleDateString()}</td>
                                <td className="p-2 flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelectedUser(user)}
                                        className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                        title="View Details"
                                    >
                                        <Eye className="w-4 h-4" />
                                    </Button>

                                    {user.role === 'admin' ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRoleChange(user.id, 'user')}
                                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-900/20"
                                            disabled={adminCount === 1}
                                            title={adminCount === 1 ? "Cannot demote the last admin" : "Demote to user"}
                                        >
                                            <ShieldOff className="w-4 h-4" />
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRoleChange(user.id, 'admin')}
                                            className="text-green-400 hover:text-green-300 hover:bg-green-900/20"
                                            title="Promote to Admin"
                                        >
                                            <Shield className="w-4 h-4" />
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {users.length === 0 && (
                    <div className="text-center py-8 ascii-dim">
                        No users found
                    </div>
                )}
            </div>

            {/* Warning */}
            {adminCount === 1 && (
                <div className="ascii-box p-4 bg-yellow-500/10 border-yellow-500/30">
                    <div className="flex items-start gap-2">
                        <Shield className="w-5 h-5 text-yellow-500 mt-0.5" />
                        <div>
                            <div className="text-yellow-500 font-bold text-sm mb-1">WARNING</div>
                            <div className="text-xs ascii-dim">
                                There is only one admin remaining. You cannot demote the last admin to prevent lockout.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* User Detail Modal */}
            {selectedUser && (
                <UserDetailModal
                    user={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    onUpdate={loadUsers}
                />
            )}
        </div>
    );
}
