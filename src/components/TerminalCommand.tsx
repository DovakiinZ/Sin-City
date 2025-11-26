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

    const commands: Record<string, () => Promise<string> | string> = {
        help: () => {
            let helpText = `Available commands:
  help     - Show this help message
  about    - About Sin City
  clear    - Clear terminal
  posts    - List recent posts
  whoami   - Display current user
  date     - Show current date/time
  exit     - Close terminal`;

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
                const { data, error } = await supabase
                    .from('posts')
                    .select('title, slug, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (error) throw error;

                if (!data || data.length === 0) {
                    return "No posts found.";
                }

                let output = "Recent Posts:\n";
                data.forEach((post, i) => {
                    output += `  ${i + 1}. ${post.title} (${post.slug})\n`;
                });
                output += "\nUse '/posts' route to view all";
                return output;
            } catch (error: any) {
                return `Error fetching posts: ${error.message}`;
            }
        },

        whoami: () => user?.displayName || user?.email?.split('@')[0] || "guest",

        date: () => new Date().toString(),

        exit: () => {
            onClose();
            return "Closing terminal...";
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
