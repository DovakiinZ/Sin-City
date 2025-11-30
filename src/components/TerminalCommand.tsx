import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface TerminalCommandProps {
    onClose: () => void;
}

const TerminalCommand = ({ onClose }: TerminalCommandProps) => {
    const { user } = useAuth();
    const [input, setInput] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [history, setHistory] = useState<string[]>([
        "SIN CITY Terminal v2.0",
        "Type 'help' for available commands",
        "",
    ]);

    useEffect(() => {
        checkAdminStatus();
    }, [user]);

    const checkAdminStatus = async () => {
        if (!user) {
            setIsAdmin(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (!error && data?.role === 'admin') {
                setIsAdmin(true);
            }
        } catch (error) {
            setIsAdmin(false);
        }
    };

    const commands: Record<string, (args?: string[]) => Promise<string> | string> = {
        help: () => {
            let helpText = `Available commands:
  help          - Show this help message
  about         - About Sin City
  clear         - Clear terminal
  
 Navigation:
  goto <page>   - Navigate (home, posts, about, profile, admin)
  open <slug>   - Open a specific post
  random        - Open random post
  search <q>    - Search posts
  
 Content:
  posts         - List recent posts
  trending      - Show trending posts
  tags          - List all tags
  categories    - List categories
  
 Social:
  whoami        - Display current user
  follow <user> - Follow a user
  notifications - Show notifications
  stats         - Your stats
  
 Fun:
  hack          - Hacking animation
  quote         - Random quote
  matrix        - Matrix effect
  
 System:
  date          - Show date/time
  version       - Version info
  exit          - Close terminal`;

            if (isAdmin) {
                helpText += `

Admin Commands (sudo):
  sudo stats              - Show database statistics
  sudo list-users         - List all users
  sudo list-posts         - List all posts
  sudo promote <username> - Promote user to admin
  sudo demote <username>  - Demote admin to user
  sudo delete-post <slug> - Delete a post
  sudo delete-user <user> - Delete a user profile`;
            }

            return helpText;
        },

        about: () => `SIN CITY - ASCII Blog Platform
Version: 2.0.0
Author: Dovakiin
Description: A retro terminal-themed blog
Built with: React + TypeScript + Vite`,

        clear: () => {
            setHistory([]);
            return "";
        },

        posts: async () => {
            try {
                // RLS policies will filter for published posts
                const { data, error } = await supabase
                    .from('posts')
                    .select('title, slug, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (error) {
                    console.error('[Terminal:posts] Error:', error);
                    throw error;
                }

                if (!data || data.length === 0) {
                    return "No posts found. Create your first post at /create";
                }

                let output = "Recent Posts:\n";
                data.forEach((post, i) => {
                    output += `  ${i + 1}. ${post.title} (${post.slug})\n`;
                });
                output += "\nUse '/posts' route to view all";
                return output;
            } catch (error: any) {
                console.error('[Terminal:posts] Exception:', error);
                return `Error fetching posts: ${error.message || 'Unknown error'}`;
            }
        },

        whoami: () => user?.displayName || user?.email?.split('@')[0] || "guest",

        date: () => new Date().toString(),

        exit: () => {
            onClose();
            return "Closing terminal...";
        },

        // Navigation commands
        goto: (args?: string[]) => {
            if (!args || args.length === 0) {
                return "Usage: goto <page>\nPages: home, posts, about, profile, admin, create";
            }
            const page = args[0].toLowerCase();
            const routes: Record<string, string> = {
                home: "/",
                posts: "/posts",
                about: "/about",
                profile: "/profile",
                admin: "/admin",
                create: "/create",
                contact: "/contact",
            };
            if (routes[page]) {
                window.location.href = routes[page];
                return `Navigating to ${page}...`;
            }
            return `Unknown page: ${page}`;
        },

        open: async (args?: string[]) => {
            if (!args || args.length === 0) {
                return "Usage: open <post-slug>";
            }
            window.location.href = `/post/${args[0]}`;
            return `Opening post: ${args[0]}...`;
        },

        random: async () => {
            try {
                console.log('[Terminal:random] Fetching random post...');
                // RLS policies will filter for published posts
                const { data, error } = await supabase
                    .from('posts')
                    .select('slug, title')
                    .limit(100);

                if (error) {
                    console.error('[Terminal:random] Database error:', error);
                    return `Error loading posts: ${error.message}`;
                }

                if (!data || data.length === 0) {
                    console.log('[Terminal:random] No posts found');
                    return "No posts available. Create your first post at /create";
                }

                const randomPost = data[Math.floor(Math.random() * data.length)];
                console.log(`[Terminal:random] Opening post: ${randomPost.title}`);
                window.location.href = `/post/${randomPost.slug}`;
                return `Opening random post: ${randomPost.title}...`;
            } catch (error: any) {
                console.error('[Terminal:random] Exception:', error);
                return `Failed to load random post: ${error.message || 'Unknown error'}`;
            }
        },

        search: async (args?: string[]) => {
            if (!args || args.length === 0) {
                return "Usage: search <query>";
            }
            const query = args.join(' ');
            window.location.href = `/search?q=${encodeURIComponent(query)}`;
            return `Searching for: ${query}...`;
        },

        // Content commands
        trending: async () => {
            try {
                const { data, error } = await supabase
                    .from('posts')
                    .select('title, slug, view_count')
                    .eq('draft', false)
                    .order('view_count', { ascending: false })
                    .limit(5);

                if (error || !data || data.length === 0) {
                    return "No trending posts";
                }

                let output = "🔥 Trending Posts:\n";
                data.forEach((post, i) => {
                    output += `  ${i + 1}. ${post.title} (${post.view_count || 0} views)\n`;
                });
                return output;
            } catch (error: any) {
                return `Error: ${error.message}`;
            }
        },

        tags: async () => {
            try {
                const { data, error } = await supabase
                    .from('tags')
                    .select('name, usage_count')
                    .order('usage_count', { ascending: false })
                    .limit(15);

                if (error || !data || data.length === 0) {
                    return "No tags found";
                }

                let output = "📌 Popular Tags:\n";
                data.forEach((tag, i) => {
                    output += `  ${i + 1}. #${tag.name} (${tag.usage_count} posts)\n`;
                });
                return output;
            } catch (error: any) {
                return `Error: ${error.message}`;
            }
        },

        categories: async () => {
            try {
                const { data, error } = await supabase
                    .from('categories')
                    .select('name, description')
                    .order('name');

                if (error || !data || data.length === 0) {
                    return "No categories found";
                }

                let output = "📁 Categories:\n";
                data.forEach((cat, i) => {
                    output += `  ${i + 1}. ${cat.name} - ${cat.description}\n`;
                });
                return output;
            } catch (error: any) {
                return `Error: ${error.message}`;
            }
        },

        // Social commands
        follow: async (args?: string[]) => {
            if (!user) {
                return "Please login to follow users";
            }
            if (!args || args.length === 0) {
                return "Usage: follow <username>";
            }
            // This would need actual implementation
            return `Following ${args[0]}... (Feature coming soon!)`;
        },

        notifications: async () => {
            if (!user) {
                return "Please login to view notifications";
            }
            try {
                const { data, error } = await supabase
                    .from('notifications')
                    .select('type, content, created_at, read')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (error || !data || data.length === 0) {
                    return "No notifications";
                }

                let output = "🔔 Recent Notifications:\n";
                data.forEach((notif, i) => {
                    const badge = notif.read ? "" : "[NEW] ";
                    output += `  ${i + 1}. ${badge}${notif.type}: ${JSON.stringify(notif.content).substring(0, 50)}...\n`;
                });
                return output;
            } catch (error: any) {
                return `Error: ${error.message}`;
            }
        },

        stats: async () => {
            if (!user) {
                return "Please login to view stats";
            }
            try {
                const { count: postsCount } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id);

                const { count: followersCount } = await supabase
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('following_id', user.id);

                const { count: followingCount } = await supabase
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('follower_id', user.id);

                return `📊 Your Stats:
  Posts: ${postsCount || 0}
  Followers: ${followersCount || 0}
  Following: ${followingCount || 0}`;
            } catch (error: any) {
                return `Error: ${error.message}`;
            }
        },

        // Fun commands
        hack: () => {
            let output = "Initializing hack sequence...\n";
            output += "[████████████████████] 100%\n";
            output += "Access granted. Welcome to the mainframe.\n";
            output += "⚠️  WARNING: Unauthorized access detected\n";
            output += "Just kidding! This is just for fun 😄";
            return output;
        },

        quote: () => {
            const quotes = [
                "The future is already here – it's just not evenly distributed. - William Gibson",
                "Any sufficiently advanced technology is indistinguishable from magic. - Arthur C. Clarke",
                "In cyberspace, no one can hear you scream. - Anonymous",
                "The street finds its own uses for things. - William Gibson",
                "We are stuck with technology when what we really want is just stuff that works. - Douglas Adams",
                "The best way to predict the future is to invent it. - Alan Kay",
                "Code is poetry. - WordPress",
                "Talk is cheap. Show me the code. - Linus Torvalds",
            ];
            return quotes[Math.floor(Math.random() * quotes.length)];
        },

        matrix: () => {
            return "Wake up, Bassam... The Matrix has you...\nFollow the white rabbit. 🐰";
        },

        version: () => {
            return `SIN CITY Terminal v2.0
Build: ${new Date().toISOString().split('T')[0]}
Platform: Web
Engine: React + Vite`;
        },
    };

    const sudoCommands: Record<string, (args: string[]) => Promise<string>> = {
        stats: async () => {
            try {
                const { count: postsCount } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true });

                const { count: usersCount } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true });

                const { count: commentsCount } = await supabase
                    .from('comments')
                    .select('*', { count: 'exact', head: true });

                return `Database Statistics:
  Total Posts: ${postsCount || 0}
  Total Users: ${usersCount || 0}
  Total Comments: ${commentsCount || 0}`;
            } catch (error: any) {
                return `Error fetching stats: ${error.message}`;
            }
        },

        "list-users": async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('username, role, created_at')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                if (!data || data.length === 0) {
                    return "No users found.";
                }

                let output = "Users:\n";
                data.forEach((u, i) => {
                    const roleTag = u.role === 'admin' ? '[ADMIN]' : '[USER]';
                    output += `  ${i + 1}. ${u.username || 'N/A'} ${roleTag}\n`;
                });
                return output;
            } catch (error: any) {
                return `Error listing users: ${error.message}`;
            }
        },

        "list-posts": async () => {
            try {
                const { data, error } = await supabase
                    .from('posts')
                    .select('title, slug, author_name')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                if (!data || data.length === 0) {
                    return "No posts found.";
                }

                let output = "Posts:\n";
                data.forEach((p, i) => {
                    output += `  ${i + 1}. ${p.title} by ${p.author_name || 'Unknown'} (${p.slug})\n`;
                });
                return output;
            } catch (error: any) {
                return `Error listing posts: ${error.message}`;
            }
        },

        promote: async (args: string[]) => {
            if (args.length === 0) {
                return "Usage: sudo promote <username>";
            }

            const username = args[0];

            try {
                const { error } = await supabase
                    .from('profiles')
                    .update({ role: 'admin' })
                    .eq('username', username);

                if (error) throw error;

                return `✓ User '${username}' promoted to admin`;
            } catch (error: any) {
                return `Error promoting user: ${error.message}`;
            }
        },

        demote: async (args: string[]) => {
            if (args.length === 0) {
                return "Usage: sudo demote <username>";
            }

            const username = args[0];

            try {
                // Check if this is the last admin
                const { count } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'admin');

                if (count === 1) {
                    return "Error: Cannot demote the last admin";
                }

                const { error } = await supabase
                    .from('profiles')
                    .update({ role: 'user' })
                    .eq('username', username);

                if (error) throw error;

                return `✓ User '${username}' demoted to user`;
            } catch (error: any) {
                return `Error demoting user: ${error.message}`;
            }
        },

        "delete-post": async (args: string[]) => {
            if (args.length === 0) {
                return "Usage: sudo delete-post <slug>";
            }

            const slug = args[0];

            try {
                const { error } = await supabase
                    .from('posts')
                    .delete()
                    .eq('slug', slug);

                if (error) throw error;

                return `✓ Post '${slug}' deleted successfully`;
            } catch (error: any) {
                return `Error deleting post: ${error.message}`;
            }
        },

        "delete-user": async (args: string[]) => {
            if (args.length === 0) {
                return "Usage: sudo delete-user <username>";
            }

            const username = args[0];

            try {
                const { error } = await supabase
                    .from('profiles')
                    .delete()
                    .eq('username', username);

                if (error) throw error;

                return `✓ User '${username}' deleted successfully`;
            } catch (error: any) {
                return `Error deleting user: ${error.message}`;
            }
        },
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.trim();

        if (!cmd) return;

        // Check if it's a sudo command
        if (cmd.toLowerCase().startsWith('sudo ')) {
            if (!isAdmin) {
                setHistory([...history, `$ ${input}`, "Permission denied: admin privileges required", ""]);
                setInput("");
                return;
            }

            // Parse sudo command
            const parts = cmd.substring(5).trim().split(' ');
            const sudoCmd = parts[0].toLowerCase();
            const args = parts.slice(1);

            if (sudoCommands[sudoCmd]) {
                const output = await sudoCommands[sudoCmd](args);
                setHistory([...history, `$ ${input}`, output, ""]);
            } else {
                setHistory([...history, `$ ${input}`, `Unknown sudo command: ${sudoCmd}. Type 'help' for available commands.`, ""]);
            }
        } else {
            // Regular command
            const cmdLower = cmd.toLowerCase();
            let output: string;

            if (commands[cmdLower]) {
                const result = commands[cmdLower]();
                output = result instanceof Promise ? await result : result;
            } else {
                output = `Command not found: ${cmd}. Type 'help' for available commands.`;
            }

            setHistory([...history, `$ ${input}`, output, ""]);
        }

        setInput("");
    };

    return (
        <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl ascii-box bg-background p-4">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <pre className="ascii-highlight">TERMINAL</pre>
                        {isAdmin && <span className="text-xs text-yellow-500">[ADMIN]</span>}
                    </div>
                    <button
                        onClick={onClose}
                        className="ascii-text hover:ascii-highlight"
                    >
                        [X]
                    </button>
                </div>

                <div className="bg-black/50 p-4 h-96 overflow-y-auto mb-4 font-mono text-sm">
                    {history.map((line, i) => (
                        <pre key={i} className={line.startsWith("$") ? "ascii-highlight" : "ascii-text"}>
                            {line}
                        </pre>
                    ))}
                    <div className="flex items-center">
                        <span className="ascii-highlight mr-2">$</span>
                        <form onSubmit={handleSubmit} className="flex-1">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className="bg-transparent border-none outline-none ascii-text w-full typing-cursor"
                                autoFocus
                                placeholder="Type a command..."
                            />
                        </form>
                    </div>
                </div>

                <pre className="ascii-dim text-xs">
                    {`Press 'Esc' to close | Type 'help' for commands`}
                </pre>
            </div>
        </div>
    );
};

export default TerminalCommand;
