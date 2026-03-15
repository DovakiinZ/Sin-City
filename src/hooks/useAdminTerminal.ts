import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UserData {
    user_id: string;
    username: string;
    display_name: string | null;
    email: string | null;
    role: string;
    bio: string | null;
    avatar_url: string | null;
    created_at: string;
    last_seen: string | null;
    post_count: number;
    comment_count: number;
    followers_count: number;
    following_count: number;
    security_data: {
        real_ip: string | null;
        ip_fingerprint: string | null;
        last_seen_at: string | null;
        is_blocked: boolean;
    } | null;
}

interface GuestData {
    guest_id: string;
    fingerprint: string;
    fingerprint_hash: string | null;
    session_id: string | null;
    email: string | null;
    email_verified: boolean;
    device_info: {
        userAgent?: string;
        screen?: string;
        timezone?: string;
        language?: string;
        platform?: string;
    } | null;
    network_info: {
        ip_hash?: string;
        country?: string;
        city?: string;
        isp?: string;
        vpn_detected?: boolean;
        tor_detected?: boolean;
    } | null;
    post_count: number;
    comment_count: number;
    page_views: number;
    trust_score: number;
    flags: string[];
    status: 'active' | 'blocked' | 'restricted';
    first_seen_at: string;
    last_seen_at: string;
    blocked_at: string | null;
    notes: string | null;
    security_data: {
        real_ip: string | null;
        ip_fingerprint: string | null;
        last_seen_at: string | null;
        is_blocked: boolean;
    } | null;
}

interface PostInfo {
    id: string;
    title: string;
    slug: string;
    created_at: string;
    hidden: boolean;
}

interface CommandResult {
    output: string;
    isError?: boolean;
    isSuccess?: boolean;
    graphData?: {
        entity_id: string;
        entity_type: string;
        nodes: any[];
        edges: any[];
        node_count: number;
        edge_count: number;
    };
}

interface UseAdminTerminalProps {
    postId: string;
    userId?: string | null;
    guestId?: string | null;
}

export function useAdminTerminal({ postId, userId, guestId }: UseAdminTerminalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [guestData, setGuestData] = useState<GuestData | null>(null);
    const [authorType, setAuthorType] = useState<'user' | 'guest' | 'unknown'>('unknown');

    // Log command to audit table
    const logCommand = useCallback(async (
        command: string,
        args: Record<string, any> = {},
        resultSummary?: string,
        actionTaken?: string,
        success: boolean = true
    ) => {
        try {
            await supabase.rpc('log_admin_terminal_command', {
                p_target_user_id: userId || null,
                p_target_guest_id: guestId || null,
                p_post_id: postId,
                p_command: command,
                p_command_args: args,
                p_result_summary: resultSummary,
                p_action_taken: actionTaken,
                p_success: success
            });
        } catch (error) {
            console.error('[AdminTerminal] Failed to log command:', error);
        }
    }, [postId, userId, guestId]);

    // Get post author info
    const getAuthorInfo = useCallback(async (): Promise<{ type: 'user' | 'guest' | 'unknown'; id: string | null }> => {
        if (userId) {
            setAuthorType('user');
            return { type: 'user', id: userId };
        }
        if (guestId) {
            setAuthorType('guest');
            return { type: 'guest', id: guestId };
        }

        try {
            const { data, error } = await supabase.rpc('admin_get_post_author_info', {
                p_post_id: postId
            });

            if (error) throw error;

            const type = data?.author_type || 'unknown';
            setAuthorType(type);
            return { type, id: data?.author_id };
        } catch (error) {
            console.error('[AdminTerminal] Error getting author info:', error);
            return { type: 'unknown', id: null };
        }
    }, [postId, userId, guestId]);

    // Fetch full user data
    const fetchUserData = useCallback(async (targetUserId: string): Promise<UserData | null> => {
        try {
            console.log('[AdminTerminal] Calling admin_get_user_full_data with:', targetUserId);
            const { data, error } = await supabase.rpc('admin_get_user_full_data', {
                p_user_id: targetUserId
            });

            console.log('[AdminTerminal] RPC response:', { data, error });

            if (error) {
                console.error('[AdminTerminal] RPC Error:', error);
                throw new Error(`${error.message} (${error.code})`);
            }
            setUserData(data);
            return data;
        } catch (error: any) {
            console.error('[AdminTerminal] Error fetching user data:', error);
            throw error;
        }
    }, []);

    // Fetch full guest data
    const fetchGuestData = useCallback(async (targetGuestId: string): Promise<GuestData | null> => {
        try {
            const { data, error } = await supabase.rpc('admin_get_guest_full_data', {
                p_guest_id: targetGuestId
            });

            if (error) throw error;
            setGuestData(data);
            return data;
        } catch (error) {
            console.error('[AdminTerminal] Error fetching guest data:', error);
            return null;
        }
    }, []);

    // Get post history for user/guest
    const getPostHistory = useCallback(async (limit: number = 10): Promise<PostInfo[]> => {
        try {
            let query = supabase
                .from('posts')
                .select('id, title, slug, created_at, hidden')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (userId) {
                query = query.eq('user_id', userId);
            } else if (guestId) {
                query = query.eq('guest_id', guestId);
            } else {
                return [];
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[AdminTerminal] Error fetching post history:', error);
            return [];
        }
    }, [userId, guestId]);

    // Parse user agent string
    const parseUserAgent = (ua?: string): { browser: string; os: string; device: string } => {
        if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

        let browser = 'Unknown';
        let os = 'Unknown';
        let device = 'Desktop';

        // Browser detection
        if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Chrome')) browser = 'Chrome';
        else if (ua.includes('Safari')) browser = 'Safari';
        else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

        // OS detection
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac OS')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

        // Device detection
        if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobile';
        else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet';

        return { browser, os, device };
    };

    // Format user data as terminal output
    const formatUserOutput = (data: UserData): string => {
        const secData = data.security_data as any || {};
        const { browser, os, device } = parseUserAgent(secData?.ip_fingerprint);

        return `
╔══════════════════════════════════════════════════════════
║ USER PROFILE: @${data.username || 'unknown'}
╠══════════════════════════════════════════════════════════
║ user_id:     ${data.user_id}
║ username:    ${data.username || 'N/A'}
║ display:     ${data.display_name || 'N/A'}
║ email:       ${data.email || 'N/A'}
║ role:        ${data.role || 'user'}
║ bio:         ${data.bio?.substring(0, 50) || 'N/A'}${data.bio && data.bio.length > 50 ? '...' : ''}
║ created:     ${new Date(data.created_at).toLocaleString()}
║ last_seen:   ${data.last_seen ? new Date(data.last_seen).toLocaleString() : 'Never'}
║
║ NETWORK DATA:
║ real_ip:     ${secData?.real_ip || 'Not captured'}
║ fingerprint: ${secData?.ip_fingerprint?.substring(0, 16) || 'N/A'}...
║ country:     ${secData?.country || 'Unknown'}
║ city:        ${secData?.city || 'Unknown'}
║ isp:         ${secData?.isp || 'Unknown'}
║ vpn:         ${secData?.vpn_detected ? 'DETECTED ⚠️' : 'Not detected'}
║
║ DEVICE:
║ browser:     ${browser}
║ os:          ${os}
║ device:      ${device}
║
║ ACTIVITY:
║ posts:       ${data.post_count}
║ comments:    ${data.comment_count}
║ reactions:   ${(data as any).reactions_received || 0} received
║ views:       ${(data as any).total_views || 0} total
║ followers:   ${data.followers_count}
║ following:   ${data.following_count}
╚══════════════════════════════════════════════════════════`;
    };

    // Format guest data as terminal output
    const formatGuestOutput = (data: GuestData): string => {
        const deviceInfo = data.device_info || {};
        const networkInfo = data.network_info || {};
        const { browser, os, device } = parseUserAgent(deviceInfo.userAgent);

        return `
╔══════════════════════════════════════════════════════════
║ ANONYMOUS TRACE: guest_${data.guest_id.substring(0, 8)}
╠══════════════════════════════════════════════════════════
║ guest_id:    ${data.guest_id}
║ fingerprint: ${data.fingerprint}
║ session_id:  ${data.session_id || 'N/A'}
║ email:       ${data.email || 'Not provided'}
║ verified:    ${data.email_verified ? 'Yes ✓' : 'No'}
║
║ NETWORK DATA:
║ ip_hash:     ${networkInfo.ip_hash || 'N/A'}
║ real_ip:     ${data.security_data?.real_ip || 'Not captured'}
║ country:     ${networkInfo.country || 'Unknown'}
║ city:        ${networkInfo.city || 'Unknown'}
║ isp:         ${networkInfo.isp || 'Unknown'}
║ vpn:         ${networkInfo.vpn_detected ? 'DETECTED ⚠️' : 'Not detected'}
║ tor:         ${networkInfo.tor_detected ? 'DETECTED ⚠️' : 'Not detected'}
║
║ DEVICE:
║ browser:     ${browser}
║ os:          ${os}
║ device:      ${device}
║ screen:      ${deviceInfo.screen || 'Unknown'}
║ timezone:    ${deviceInfo.timezone || 'Unknown'}
║ language:    ${deviceInfo.language || 'Unknown'}
║
║ BEHAVIOR:
║ posts:       ${data.post_count}
║ comments:    ${data.comment_count}
║ page_views:  ${data.page_views}
║ trust_score: ${data.trust_score}/100
║ flags:       ${data.flags?.length ? data.flags.join(', ') : 'None'}
║ status:      ${data.status.toUpperCase()}
║ first_seen:  ${new Date(data.first_seen_at).toLocaleString()}
║ last_seen:   ${new Date(data.last_seen_at).toLocaleString()}
${data.blocked_at ? `║ blocked_at:  ${new Date(data.blocked_at).toLocaleString()} ⛔` : ''}
${data.notes ? `║ notes:       ${data.notes}` : ''}
╚══════════════════════════════════════════════════════════`;
    };

    // Execute admin action
    const executeAction = useCallback(async (
        action: 'ban' | 'unban' | 'restrict' | 'unrestrict' | 'verify',
        confirmed: boolean = false
    ): Promise<CommandResult> => {
        if (!confirmed) {
            return {
                output: `⚠️  This action requires confirmation.\nType: sudo action --${action} --confirm`,
                isError: true
            };
        }

        setIsLoading(true);
        try {
            const authorInfo = await getAuthorInfo();

            if (authorInfo.type === 'user' && authorInfo.id) {
                const newStatus = action === 'ban' ? 'blocked' :
                    action === 'restrict' ? 'restricted' : 'active';

                const { error } = await supabase
                    .from('profiles')
                    .update({
                        status: newStatus,
                        ...(action === 'ban' ? { blocked_at: new Date().toISOString() } : {})
                    })
                    .eq('id', authorInfo.id);

                if (error) throw error;

                await logCommand(`sudo action --${action}`, { confirmed: true }, `User ${action}ed`, action, true);

                return {
                    output: `✓ User successfully ${action}ed.`,
                    isSuccess: true
                };
            } else if (authorInfo.type === 'guest' && authorInfo.id) {
                const newStatus = action === 'ban' ? 'blocked' :
                    action === 'restrict' ? 'restricted' : 'active';

                const { error } = await supabase
                    .from('guests')
                    .update({
                        status: newStatus,
                        ...(action === 'ban' ? { blocked_at: new Date().toISOString() } : {})
                    })
                    .eq('id', authorInfo.id);

                if (error) throw error;

                await logCommand(`sudo action --${action}`, { confirmed: true }, `Guest ${action}ed`, action, true);

                return {
                    output: `✓ Guest successfully ${action}ed.`,
                    isSuccess: true
                };
            }

            return {
                output: 'Error: Could not identify target user/guest',
                isError: true
            };
        } catch (error: any) {
            await logCommand(`sudo action --${action}`, { confirmed: true }, error.message, action, false);
            return {
                output: `Error: ${error.message}`,
                isError: true
            };
        } finally {
            setIsLoading(false);
        }
    }, [getAuthorInfo, logCommand]);

    // Main command executor - requires 'sudo' prefix for privileged commands
    const executeCommand = useCallback(async (input: string): Promise<CommandResult> => {
        const parts = input.trim().split(/\s+/);
        const firstWord = parts[0].toLowerCase();

        // Commands that don't require sudo prefix
        const nonSudoCommands = ['help', 'clear', 'exit', 'auto-investigate', 'explain', 'suggest', 'timeline', 'trace'];

        let command: string;
        let args: string[];

        // Check for sudo prefix
        if (firstWord === 'sudo') {
            if (parts.length < 2) {
                return {
                    output: 'Usage: sudo <command> [args]\nType "help" for available commands.',
                    isError: true
                };
            }
            command = parts[1].toLowerCase();
            args = parts.slice(2);
        } else if (nonSudoCommands.includes(firstWord)) {
            // Allow help, clear, exit without sudo
            command = firstWord;
            args = parts.slice(1);
        } else {
            // All other commands require sudo prefix
            return {
                output: `Permission denied: '${firstWord}' requires elevated privileges.\nUsage: sudo ${firstWord} [args]`,
                isError: true
            };
        }

        setIsLoading(true);

        try {
            switch (command) {
                case 'help':
                    await logCommand('help');
                    return {
                        output: `
╔══════════════════════════════════════════════════════════
║ ADMIN TERMINAL - AVAILABLE COMMANDS
╠══════════════════════════════════════════════════════════
║ sudo whoami              Current admin info
║ sudo user --full         Full profile of post author
║ sudo anon --trace        Full trace of anonymous author
║ sudo post --history      All posts by this author
║ sudo risk --scan         Trust score analysis
║
║ 🔥 HACKER MODE:
║ auto-investigate anon <id>   Full investigation report
║ explain risk <id>            Risk score breakdown
║ suggest action <id>          AI moderation suggestions
║ timeline <id>                Activity timeline replay
║ trace ip <ip>                Find all entities by IP
║ graph <id>                   Visual relationship graph
║
║ ACTIONS (require --confirm):
║ sudo action --ban        Ban user/guest
║ sudo action --unban      Unban user/guest
║ sudo action --restrict   Restrict user/guest
║ sudo action --verify     Mark as verified
║
║ UTILITY:
║ clear                    Clear terminal output
║ exit                     Close terminal
╚══════════════════════════════════════════════════════════`
                    };

                case 'whoami': {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('username, role')
                        .eq('id', (await supabase.auth.getUser()).data.user?.id)
                        .single();

                    await logCommand('sudo whoami');
                    return {
                        output: `${profile?.username || 'admin'} [${profile?.role?.toUpperCase() || 'ADMIN'}]`
                    };
                }

                case 'user':
                    if (args.includes('--full')) {
                        const authorInfo = await getAuthorInfo();
                        if (authorInfo.type !== 'user' || !authorInfo.id) {
                            await logCommand('sudo user --full', {}, 'Not a registered user', undefined, false);
                            return {
                                output: 'This post was not created by a registered user.\nTry: sudo anon --trace',
                                isError: true
                            };
                        }
                        try {
                            const data = await fetchUserData(authorInfo.id);
                            if (!data) {
                                return { output: 'Error: Could not fetch user data (no data returned)', isError: true };
                            }
                            await logCommand('sudo user --full', {}, `Retrieved user: ${data.username}`);
                            return { output: formatUserOutput(data) };
                        } catch (err: any) {
                            return {
                                output: `Error: ${err.message || 'Could not fetch user data'}\n\nCheck browser console for details.`,
                                isError: true
                            };
                        }
                    }
                    return { output: 'Usage: sudo user --full', isError: true };

                case 'anon':
                    if (args.includes('--trace')) {
                        const authorInfo = await getAuthorInfo();
                        if (authorInfo.type !== 'guest' || !authorInfo.id) {
                            await logCommand('sudo anon --trace', {}, 'Not an anonymous user', undefined, false);
                            return {
                                output: 'This post was not created by an anonymous guest.\nTry: sudo user --full',
                                isError: true
                            };
                        }
                        const data = await fetchGuestData(authorInfo.id);
                        if (!data) {
                            return { output: 'Error: Could not fetch guest data', isError: true };
                        }
                        await logCommand('sudo anon --trace', {}, `Traced guest: ${data.guest_id.substring(0, 8)}`);
                        return { output: formatGuestOutput(data) };
                    }
                    return { output: 'Usage: sudo anon --trace', isError: true };

                case 'post':
                    if (args.includes('--history')) {
                        const limitArg = args.find(a => a.startsWith('--limit='));
                        const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;
                        const posts = await getPostHistory(limit);

                        if (posts.length === 0) {
                            await logCommand('sudo post --history', { limit }, 'No posts found');
                            return { output: 'No posts found for this author.' };
                        }

                        await logCommand('sudo post --history', { limit }, `Found ${posts.length} posts`);

                        let output = `\n╔══════════════════════════════════════════════════════════\n║ POST HISTORY (${posts.length} posts)\n╠══════════════════════════════════════════════════════════\n`;
                        posts.forEach((post, i) => {
                            const hidden = post.hidden ? ' [HIDDEN]' : '';
                            output += `║ ${i + 1}. ${post.title}${hidden}\n`;
                            output += `║    slug: ${post.slug}\n`;
                            output += `║    date: ${new Date(post.created_at).toLocaleString()}\n`;
                            if (i < posts.length - 1) output += `║\n`;
                        });
                        output += `╚══════════════════════════════════════════════════════════`;

                        return { output };
                    }
                    return { output: 'Usage: sudo post --history [--limit=N]', isError: true };

                case 'risk':
                    if (args.includes('--scan')) {
                        const authorInfo = await getAuthorInfo();
                        let trustScore = 50;
                        let flags: string[] = [];
                        let output = '';

                        if (authorInfo.type === 'guest' && authorInfo.id) {
                            const data = await fetchGuestData(authorInfo.id);
                            if (data) {
                                trustScore = data.trust_score;
                                flags = data.flags || [];

                                output = `
╔══════════════════════════════════════════════════════════
║ RISK ANALYSIS - Guest ${data.guest_id.substring(0, 8)}
╠══════════════════════════════════════════════════════════
║ TRUST SCORE: ${trustScore}/100 ${trustScore < 30 ? '⚠️ HIGH RISK' : trustScore < 60 ? '⚡ MODERATE' : '✓ LOW RISK'}
║
║ RISK FACTORS:
║ • VPN/Proxy:     ${data.network_info?.vpn_detected ? 'DETECTED ⚠️' : 'Not detected ✓'}
║ • Tor Network:   ${data.network_info?.tor_detected ? 'DETECTED ⚠️' : 'Not detected ✓'}
║ • Email:         ${data.email ? (data.email_verified ? 'Verified ✓' : 'Not verified ⚡') : 'Not provided ⚠️'}
║ • Post Count:    ${data.post_count} ${data.post_count > 5 ? '✓' : '⚡'}
║ • Flags:         ${flags.length > 0 ? flags.join(', ') : 'None ✓'}
║
║ RECOMMENDATION:  ${trustScore < 30 ? 'REVIEW REQUIRED' : trustScore < 60 ? 'Monitor activity' : 'Normal user'}
╚══════════════════════════════════════════════════════════`;
                            }
                        } else if (authorInfo.type === 'user' && authorInfo.id) {
                            const data = await fetchUserData(authorInfo.id);
                            if (data) {
                                output = `
╔══════════════════════════════════════════════════════════
║ RISK ANALYSIS - User @${data.username}
╠══════════════════════════════════════════════════════════
║ TRUST LEVEL: REGISTERED USER
║
║ ACTIVITY METRICS:
║ • Posts:         ${data.post_count}
║ • Comments:      ${data.comment_count}
║ • Followers:     ${data.followers_count}
║ • Following:     ${data.following_count}
║ • IP Blocked:    ${data.security_data?.is_blocked ? 'YES ⚠️' : 'No ✓'}
║
║ RECOMMENDATION:  ${data.security_data?.is_blocked ? 'REVIEW REQUIRED' : 'Trusted registered user'}
╚══════════════════════════════════════════════════════════`;
                            }
                        } else {
                            output = 'Error: Could not determine author type';
                        }

                        await logCommand('sudo risk --scan', {}, `Trust score: ${trustScore}`);
                        return { output };
                    }
                    return { output: 'Usage: sudo risk --scan', isError: true };

                case 'action': {
                    const confirmed = args.includes('--confirm');
                    if (args.includes('--ban')) {
                        return executeAction('ban', confirmed);
                    }
                    if (args.includes('--unban')) {
                        return executeAction('unban', confirmed);
                    }
                    if (args.includes('--restrict')) {
                        return executeAction('restrict', confirmed);
                    }
                    if (args.includes('--verify')) {
                        return executeAction('verify', confirmed);
                    }
                    return {
                        output: 'Usage: sudo action --ban|--unban|--restrict|--verify [--confirm]',
                        isError: true
                    };
                }

                // === NEW HACKER-MODE COMMANDS ===

                case 'auto-investigate': {
                    // auto-investigate anon <id>
                    if (args[0] === 'anon' && args[1]) {
                        const targetId = args[1];
                        try {
                            const { data, error } = await supabase.rpc('admin_auto_investigate_anon', {
                                p_guest_id: targetId
                            });
                            if (error) throw error;

                            const d = data as any;
                            const riskFactors = (d.risk_factors || []).map((f: any) =>
                                `║   • ${f.factor} (+${f.points}pts) ${f.detail || ''}`
                            ).join('\n');

                            const output = `
╔══════════════════════════════════════════════════════════════════════
║ 🔍 AUTO-INVESTIGATION REPORT
║ Target: ${d.target?.guest_id || targetId}
║ Generated: ${new Date().toLocaleString()}
╠══════════════════════════════════════════════════════════════════════
║ IDENTITY:
║   fingerprint:    ${d.target?.fingerprint || 'N/A'}
║   email:          ${d.target?.email || 'Not provided'}
║   verified:       ${d.target?.email_verified ? 'Yes ✓' : 'No ⚠️'}
║   status:         ${d.target?.status || 'unknown'}
║   first_seen:     ${d.target?.first_seen_at ? new Date(d.target.first_seen_at).toLocaleString() : 'N/A'}
║   last_seen:      ${d.target?.last_seen_at ? new Date(d.target.last_seen_at).toLocaleString() : 'N/A'}
║
║ NETWORK:
║   real_ip:        ${d.security?.real_ip || 'Not captured'}
║   location:       ${d.security?.city || 'Unknown'}, ${d.security?.country || 'Unknown'}
║   isp:            ${d.security?.isp || 'Unknown'}
║   vpn:            ${d.security?.vpn_detected ? 'DETECTED ⚠️' : 'Not detected'}
║
║ ACTIVITY PATTERNS:
║   total_posts:    ${d.patterns?.total_posts || 0}
║   total_comments: ${d.patterns?.total_comments || 0}
║   rapid_posting:  ${d.patterns?.rapid_posting_count || 0} detected
║   duplicates:     ${d.patterns?.duplicate_content_count || 0} detected
║   hidden_posts:   ${d.patterns?.posts_hidden || 0}
║
║ RISK FACTORS:
${riskFactors || '║   None detected ✓'}
║
║ RELATED GUESTS (same IP): ${(d.related_guests || []).length}
${(d.related_guests || []).slice(0, 3).map((g: any) => `║   • ${g.guest_id.substring(0, 8)} (${g.post_count} posts)`).join('\n') || '║   None'}
║
╠══════════════════════════════════════════════════════════════════════
║ CALCULATED RISK SCORE: ${d.calculated_risk_score || 0}/100
║ ${d.calculated_risk_score >= 70 ? '⚠️ HIGH RISK' : d.calculated_risk_score >= 40 ? '⚡ MODERATE' : '✓ LOW RISK'}
╚══════════════════════════════════════════════════════════════════════`;

                            await logCommand('auto-investigate anon', { target: targetId }, `Risk: ${d.calculated_risk_score}`);
                            return { output };
                        } catch (err: any) {
                            return { output: `Error: ${err.message}`, isError: true };
                        }
                    }
                    return { output: 'Usage: auto-investigate anon <guest_id>', isError: true };
                }

                case 'explain': {
                    // explain risk <id>
                    if (args[0] === 'risk' && args[1]) {
                        const targetId = args[1];
                        try {
                            const { data, error } = await supabase.rpc('admin_explain_risk_score', {
                                p_guest_id: targetId
                            });
                            if (error) throw error;

                            const d = data as any;
                            const riskLines = (d.risk_factors || []).map((f: any) =>
                                `║   ${f.impact.padEnd(6)} ${f.factor}: ${f.reason}`
                            ).join('\n');
                            const trustLines = (d.trust_factors || []).map((f: any) =>
                                `║   ${f.impact.padEnd(6)} ${f.factor}: ${f.reason}`
                            ).join('\n');

                            const output = `
╔══════════════════════════════════════════════════════════════════════
║ RISK SCORE BREAKDOWN
║ Guest: ${d.guest_id}
╠══════════════════════════════════════════════════════════════════════
║ CURRENT SCORE: ${d.current_score}/100 (base: ${d.base_score})
║
║ RISK FACTORS (increase score):
${riskLines || '║   None'}
║
║ TRUST FACTORS (decrease score):
${trustLines || '║   None'}
║
║ RECOMMENDATION: ${d.recommendation}
╚══════════════════════════════════════════════════════════════════════`;

                            await logCommand('explain risk', { target: targetId }, `Score: ${d.current_score}`);
                            return { output };
                        } catch (err: any) {
                            return { output: `Error: ${err.message}`, isError: true };
                        }
                    }
                    return { output: 'Usage: explain risk <guest_id>', isError: true };
                }

                case 'suggest': {
                    // suggest action <id>
                    if (args[0] === 'action' && args[1]) {
                        const targetId = args[1];
                        try {
                            const { data, error } = await supabase.rpc('admin_suggest_action', {
                                p_guest_id: targetId
                            });
                            if (error) throw error;

                            const d = data as any;
                            const suggestions = (d.suggestions || []).map((s: any, i: number) =>
                                `║ ${i + 1}. ${s.action}\n║    Reason: ${s.reason}\n║    Command: ${s.command || 'N/A'}`
                            ).join('\n║\n');

                            const output = `
╔══════════════════════════════════════════════════════════════════════
║ AI MODERATION SUGGESTIONS
║ Guest: ${d.guest_id} | Risk: ${d.risk_score}/100
╠══════════════════════════════════════════════════════════════════════
${suggestions}
║
╠══════════════════════════════════════════════════════════════════════
║ ⚠️ ${d.disclaimer}
╚══════════════════════════════════════════════════════════════════════`;

                            await logCommand('suggest action', { target: targetId }, `${(d.suggestions || []).length} suggestions`);
                            return { output };
                        } catch (err: any) {
                            return { output: `Error: ${err.message}`, isError: true };
                        }
                    }
                    return { output: 'Usage: suggest action <guest_id>', isError: true };
                }

                case 'timeline': {
                    // timeline <id>
                    const targetId = args[0];
                    const entityType = guestId ? 'guest' : (userId ? 'user' : 'guest');
                    const targetEntityId = targetId || guestId || userId;

                    if (!targetEntityId) {
                        return { output: 'Usage: timeline <entity_id>', isError: true };
                    }

                    try {
                        const { data, error } = await supabase.rpc('admin_get_entity_timeline', {
                            p_entity_type: entityType,
                            p_entity_id: targetEntityId
                        });
                        if (error) throw error;

                        const d = data as any;
                        const events = (d.events || []).slice(0, 20).map((e: any) => {
                            const time = new Date(e.timestamp).toLocaleString();
                            const icon = e.type === 'POST_CREATED' ? '📝' :
                                e.type === 'COMMENT_CREATED' ? '💬' :
                                    e.type === 'IP_LOGGED' ? '🌐' :
                                        e.type === 'FIRST_SEEN' ? '👁️' : '•';
                            return `║ ${time} ${icon} ${e.description}`;
                        }).join('\n');

                        const output = `
╔══════════════════════════════════════════════════════════════════════
║ TIMELINE REPLAY
║ Entity: ${d.entity_type} / ${d.entity_id}
║ Events: ${d.event_count}
╠══════════════════════════════════════════════════════════════════════
${events || '║ No events found'}
╚══════════════════════════════════════════════════════════════════════`;

                        await logCommand('timeline', { target: targetEntityId }, `${d.event_count} events`);
                        return { output };
                    } catch (err: any) {
                        return { output: `Error: ${err.message}`, isError: true };
                    }
                }

                case 'trace': {
                    // trace ip <ip_address>
                    if (args[0] === 'ip' && args[1]) {
                        const targetIp = args[1];
                        try {
                            const { data, error } = await supabase.rpc('admin_trace_ip', {
                                p_ip: targetIp
                            });
                            if (error) throw error;

                            const d = data as any;
                            const guestLines = (d.guests || []).slice(0, 5).map((g: any) =>
                                `║   • ${g.guest_id.substring(0, 8)} | ${g.post_count} posts | ${g.status}`
                            ).join('\n');
                            const userLines = (d.users || []).slice(0, 5).map((u: any) =>
                                `║   • @${u.username} [${u.role}]`
                            ).join('\n');
                            const postLines = (d.posts || []).slice(0, 5).map((p: any) =>
                                `║   • ${p.post_id.substring(0, 8)} "${p.title?.substring(0, 30) || 'Untitled'}"`
                            ).join('\n');

                            const output = `
╔══════════════════════════════════════════════════════════════════════
║ IP TRACE RESULTS
║ Target IP: ${d.ip}
╠══════════════════════════════════════════════════════════════════════
║ GUESTS (${d.total_guests}):
${guestLines || '║   None found'}
║
║ USERS (${d.total_users}):
${userLines || '║   None found'}
║
║ POSTS (${d.total_posts}):
${postLines || '║   None found'}
╚══════════════════════════════════════════════════════════════════════`;

                            await logCommand('trace ip', { ip: targetIp }, `${d.total_guests} guests, ${d.total_users} users`);
                            return { output };
                        } catch (err: any) {
                            return { output: `Error: ${err.message}`, isError: true };
                        }
                    }
                    return { output: 'Usage: trace ip <ip_address>', isError: true };
                }

                case 'graph': {
                    // graph <id> - returns graph data for visualization
                    const targetId = args[0] || guestId || userId;

                    if (!targetId) {
                        return { output: 'Usage: graph <entity_id>', isError: true };
                    }

                    try {
                        const { data, error } = await supabase.rpc('admin_get_graph_data', {
                            p_entity_id: targetId
                        });
                        if (error) throw error;

                        const d = data as any;

                        if (d.error) {
                            return { output: `Error: ${d.error}`, isError: true };
                        }

                        // Return special graph data marker that the terminal UI will handle
                        await logCommand('graph', { target: targetId }, `${d.node_count} nodes, ${d.edge_count} edges`);
                        return {
                            output: '__GRAPH__',
                            graphData: d
                        };
                    } catch (err: any) {
                        return { output: `Error: ${err.message}`, isError: true };
                    }
                }

                case 'clear':
                    return { output: '__CLEAR__' };

                case 'exit':
                    return { output: '__EXIT__' };

                default:
                    await logCommand(`sudo ${command}`, { args }, 'Unknown command', undefined, false);
                    return {
                        output: `Command not found: ${command}\nType 'help' for available commands.`,
                        isError: true
                    };
            }
        } catch (error: any) {
            return {
                output: `Error: ${error.message}`,
                isError: true
            };
        } finally {
            setIsLoading(false);
        }
    }, [getAuthorInfo, fetchUserData, fetchGuestData, getPostHistory, executeAction, logCommand]);

    return {
        executeCommand,
        isLoading,
        userData,
        guestData,
        authorType
    };
}

export default useAdminTerminal;
