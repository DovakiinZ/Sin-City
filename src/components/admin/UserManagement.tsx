import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Shield, ShieldOff, Users as UsersIcon, Globe, MapPin, Wifi, AlertTriangle, Ban, CheckCircle } from "lucide-react";

interface UserProfile {
    id: string;
    username: string;
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
            // Get profiles
            const { data: profiles, error: profileError } = await supabase
                .from("profiles")
                .select("id, username, role, created_at, country, city, ip_hash, isp, vpn_detected, tor_detected, last_ip_update")
                .order("created_at", { ascending: true });

            if (profileError) throw profileError;

            // Get secure logs for these users
            const { data: securityLogs, error: logError } = await supabase
                .from("ip_security_logs")
                .select("user_id, real_ip, ip_fingerprint, last_seen_at")
                .not('user_id', 'is', null);

            // Get blocked IPs
            const { data: blockedIps, error: blockError } = await supabase
                .from("blocked_ips")
                .select("ip_address");

            const blockedSet = new Set((blockedIps || []).map(b => b.ip_address));

            // Merge data
            const mergedUsers = (profiles || []).map(user => {
                const logs = securityLogs?.find(log => log.user_id === user.id);
                return {
                    ...user,
                    securityData: logs ? {
                        real_ip: logs.real_ip,
                        ip_fingerprint: logs.ip_fingerprint,
                        last_seen_at: logs.last_seen_at,
                        is_blocked: blockedSet.has(logs.real_ip)
                    } : null
                };
            });

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

    const adminCount = users.filter(u => u.role === 'admin').length;

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            <th className="p-2">Role</th>
                            <th className="p-2">Location</th>
                            <th className="p-2">Secure IP (Admin)</th>
                            <th className="p-2">Network</th>
                            <th className="p-2">Joined</th>
                            <th className="p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="border-b border-ascii-border/50 hover:bg-white/5">
                                <td className="p-2 font-mono">{user.username || 'N/A'}</td>
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
                                                <span className={`font-mono font-bold text-xs select-all ${user.securityData.is_blocked ? 'text-red-500 line-through' : 'text-red-300'}`}>
                                                    {user.securityData.real_ip}
                                                </span>
                                                {user.securityData.is_blocked && (
                                                    <span className="text-[10px] text-red-500 font-bold">BLOCKED</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] ascii-dim truncate max-w-[100px]" title={user.securityData.ip_fingerprint || ''}>
                                                {user.securityData.ip_fingerprint?.substring(0, 8)}...
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
                                <td className="p-2">
                                    {user.role === 'admin' ? (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRoleChange(user.id, 'user')}
                                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-900/20"
                                            disabled={adminCount === 1}
                                            title={adminCount === 1 ? "Cannot demote the last admin" : "Demote to user"}
                                        >
                                            <ShieldOff className="w-4 h-4 mr-1" />
                                            Demote
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRoleChange(user.id, 'admin')}
                                            className="text-green-400 hover:text-green-300 hover:bg-green-900/20"
                                        >
                                            <Shield className="w-4 h-4 mr-1" />
                                            Promote
                                        </Button>
                                    )}
                                    {user.securityData && (
                                        user.securityData.is_blocked ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleUnblockIP(user.securityData!.real_ip)}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                title="Unblock IP"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleBlockIP(user.securityData!.real_ip, user.username)}
                                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                title="Block IP"
                                            >
                                                <Ban className="w-4 h-4" />
                                            </Button>
                                        )
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
        </div>
    );
}
