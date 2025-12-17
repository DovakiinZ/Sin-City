import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { convertToAscii } from "@/lib/ascii";
import { validateMusicUrl } from "@/hooks/useMusicLinks";
import { arabicPoetry } from "@/data/arabicPoetry";

interface TerminalCommandProps {
    onClose: () => void;
}

const TerminalCommand = ({ onClose }: TerminalCommandProps) => {
    const { user } = useAuth();
    const [input, setInput] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [textColor, setTextColor] = useState<string>("green");
    const [isMaximized, setIsMaximized] = useState(false);
    const [position, setPosition] = useState({ x: 50, y: 50 });
    const [size, setSize] = useState({ w: 800, h: 500 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isResizing, setIsResizing] = useState(false);
    const dragRef = useRef<HTMLDivElement>(null);

    // Initial positioning (center) or auto-maximize on mobile
    useEffect(() => {
        if (window.innerWidth < 768) {
            setIsMaximized(true);
        } else if (!isMaximized) {
            const cx = Math.max(0, (window.innerWidth - 800) / 2);
            const cy = Math.max(0, (window.innerHeight - 500) / 2);
            setPosition({ x: cx, y: cy });
        }
    }, []);

    // Global Mouse Handlers for Drag/Resize
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && !isMaximized) {
                setPosition({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            }
            if (isResizing && !isMaximized) {
                setSize({
                    w: Math.max(400, e.clientX - position.x),
                    h: Math.max(300, e.clientY - position.y)
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, dragOffset, position, isMaximized]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isMaximized) return;
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };
    const [history, setHistory] = useState<string[]>([
        "SIN CITY Terminal v2.0",
        "Type 'help' for available commands",
        "",
    ]);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setHistory(prev => [...prev, `Loading ${file.name}...`]);

        try {
            const { ascii_text } = await convertToAscii(file, {
                width: 60,
                contrast: 1.2,
                gamma: 1.0,
                charset: 'jp2a',
                invert: false
            });

            // Add the ASCII art to history
            setHistory(prev => [...prev, ascii_text, ""]);
        } catch (error) {
            setHistory(prev => [...prev, "Error converting image to ASCII.", ""]);
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const getColorClass = (baseClass: string) => {
        const colorMap: Record<string, string> = {
            'white': 'text-white',
            'red': 'text-red-500',
            'blue': 'text-blue-500',
            'cyan': 'text-cyan-400',
            'purple': 'text-purple-500',
            'yellow': 'text-yellow-400',
            'green': 'ascii-text', // Default
        };

        const colorClass = colorMap[textColor] || 'ascii-text';

        if (baseClass === 'ascii-text') return colorClass;
        if (baseClass === 'ascii-highlight') {
            // Try to map highlight roughly to lighter version or same
            if (textColor === 'white') return 'text-gray-300';
            if (textColor === 'red') return 'text-red-300';
            return 'ascii-highlight';
        }
        return baseClass;
    };

    const playMoodMusic = async (mood: string): Promise<string> => {
        try {
            const { data, error } = await supabase
                .from('music_links')
                .select('url, title, platform')
                .eq('mood', mood)
                .eq('is_active', true);

            if (error) {
                // If column doesn't exist yet, this will error. Handle gracefully.
                console.error('Mood fetch error:', error);
                return `Error: Could not fetch ${mood} music. (Database might be missing 'mood' column)`;
            }

            if (!data || data.length === 0) {
                return `No ${mood} music found. Add some songs with '${mood}' mood in Admin Console!`;
            }

            // Pick random
            const song = data[Math.floor(Math.random() * data.length)];
            // Use location.href for better mobile compatibility (window.open is often blocked)
            window.location.href = song.url;
            return `Playing ${mood} vibes: ${song.title} (${song.platform})...`;

        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    };

    const commands: Record<string, (args?: string[]) => Promise<string> | string> = {
        help: () => {
            let helpText = `Available commands:
  help          - Show this help message
  color <c>     - Change color (green, white, red)
  sad/happy/bored - Play mood music
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
  jp2a          - Convert photo to ASCII (opens file picker)
  
 Social:
  whoami        - Display current user
  follow <user> - Follow a user
  notifications - Show notifications
  stats         - Your stats
  
 Fun:
  hack          - Hacking animation
  quote         - Random quote
  poetry        - Random Arabic poetry (alias: shi3r, شعر)
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
  sudo delete-post <slug> - Delete a post
  sudo delete-user <user> - Delete a user profile

Music Admin:
  git clone <url> <mood>  - Add song (git clone https://... sad)`;
            }

            return helpText;
        },

        color: (args?: string[]) => {
            if (!args || args.length === 0) return "Usage: color <a-f|0-9|name>\nExample: color a (green), color b (cyan)";

            const code = args[0].toLowerCase();
            const colorMap: Record<string, string> = {
                'a': 'green', 'green': 'green',
                'b': 'cyan', 'cyan': 'cyan',
                'c': 'red', 'red': 'red',
                'd': 'purple', 'purple': 'purple',
                'e': 'yellow', 'yellow': 'yellow',
                'f': 'white', 'white': 'white',
                '1': 'blue', 'blue': 'blue',
            };

            if (colorMap[code]) {
                setTextColor(colorMap[code]);
                return `Terminal color set to ${colorMap[code]}`;
            }
            return "Invalid color code. Try: a (green), b (cyan), c (red), f (white)";
        },

        // Mood Commands
        sad: async () => {
            return await playMoodMusic('sad');
        },
        happy: async () => {
            return await playMoodMusic('happy');
        },
        bored: async () => {
            return await playMoodMusic('bored');
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

        whoami: () => user?.username || user?.email?.split('@')[0] || "guest",

        date: () => new Date().toString(),

        exit: () => {
            onClose();
            return "Closing terminal...";
        },

        jp2a: () => {
            if (fileInputRef.current) {
                fileInputRef.current.click();
                return "Select an image to convert...";
            }
            return "Error: File input not found.";
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
                crowd: "/crowd",
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

        poetry: () => {
            const verse = arabicPoetry[Math.floor(Math.random() * arabicPoetry.length)];
            return verse.text;
        },

        shi3r: () => {
            const verse = arabicPoetry[Math.floor(Math.random() * arabicPoetry.length)];
            return verse.text;
        },

        "شعر": () => {
            const verse = arabicPoetry[Math.floor(Math.random() * arabicPoetry.length)];
            return verse.text;
        },

        git: async (args?: string[]) => {
            if (!isAdmin) return "Permission denied: admin privileges required";

            if (!args || args.length === 0) {
                return "usage: git clone <url> <mood>\nReview 'help' for more info.";
            }

            const subcommand = args[0].toLowerCase();

            if (subcommand === 'clone') {
                if (args.length < 3) {
                    return "fatal: you must specify a repository (url) and destination (mood)\nusage: git clone <url> <sad|happy|bored>";
                }

                const url = args[1];
                const mood = args[2].toLowerCase();

                if (!['sad', 'happy', 'bored'].includes(mood)) {
                    return `fatal: destination path '${mood}' does not exist\nAvailable moods: sad, happy, bored`;
                }

                const validation = validateMusicUrl(url);
                if (!validation.valid) {
                    return `fatal: repository '${url}' not found\nError: ${validation.error}`;
                }

                // Simulate cloning process
                // We'll try to fetch title via noembed if YouTube, otherwise generic
                let title = `${validation.platform} Track`;

                if (validation.platform === 'YouTube Music') {
                    try {
                        const fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url.replace('music.youtube.com', 'www.youtube.com'))}`;
                        const res = await fetch(fetchUrl);
                        const data = await res.json();
                        if (data.title) title = data.title;
                    } catch (e) {
                        // ignore fetch error
                    }
                } else if (validation.platform === 'Spotify') {
                    // Try to extract some ID or slug from URL for better placeholder
                    // e.g. /track/4cOdK2wGLETKBW3PvgPWqT?si=... -> 4cOd...
                    const parts = url.split('/').pop()?.split('?')[0];
                    if (parts) title = `Spotify ${parts.substring(0, 8)}...`;
                }

                try {
                    const { error } = await supabase
                        .from('music_links')
                        .insert({
                            url: url,
                            title: title,
                            platform: validation.platform,
                            mood: mood,
                            is_active: true,
                            is_hidden: true // Hide from public 'Hear This' feed
                        });

                    if (error) throw error;

                    return `Cloning into '${mood}'...\nremote: Enumerating objects: 1, done.\nremote: Counting objects: 100% (1/1), done.\nremote: Total 1 (delta 0), reused 0 (delta 0), pack-reused 0\nReceiving objects: 100% (1/1), done.\n\nSuccessfully added:\n  Song: ${title}\n  Mood: ${mood}\n  Platform: ${validation.platform}`;

                } catch (error: any) {
                    return `fatal: database error: ${error.message}`;
                }
            }

            return `git: '${subcommand}' is not a git command. See 'git --help'.`;
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
            const parts = cmd.split(' ');
            const commandName = parts[0].toLowerCase();
            const args = parts.slice(1);
            let output: string;

            if (commands[commandName]) {
                const result = commands[commandName](args);
                output = result instanceof Promise ? await result : result;
            } else {
                output = `Command not found: ${cmd}. Type 'help' for available commands.`;
            }

            setHistory([...history, `$ ${input}`, output, ""]);
        }

        setInput("");
    };

    return (
        <div
            className="fixed z-50 shadow-2xl overflow-hidden flex flex-col"
            style={{
                left: isMaximized ? 0 : position.x,
                top: isMaximized ? 0 : position.y,
                width: isMaximized ? '100vw' : size.w,
                height: isMaximized ? '100vh' : size.h,
                backgroundColor: 'rgba(10, 10, 10, 0.95)',
                border: '1px solid',
                borderColor: textColor === 'green' ? '#22c55e' : textColor === 'red' ? '#dc2626' : '#ffffff' // basic border match
            }}
        >
            {/* Header / Drag Handle */}
            <div
                className={`flex justify-between items-center p-2 select-none cursor-move border-b ${textColor === 'green' ? 'border-green-800' : 'border-gray-700'}`}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <pre className={`${getColorClass("ascii-highlight")} font-bold`}>SIN CITY TERMINAL</pre>
                    {isAdmin && <span className="text-xs text-yellow-500">[ADMIN]</span>}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileSelect}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsMaximized(!isMaximized)}
                        className={`${getColorClass("ascii-text")} hover:opacity-80 font-mono`}
                    >
                        [{isMaximized ? '❐' : '□'}]
                    </button>
                    <button
                        onClick={onClose}
                        className={`${getColorClass("ascii-text")} hover:opacity-80 font-mono`}
                    >
                        [X]
                    </button>
                </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm" onClick={() => document.querySelector('.typing-cursor')?.clientWidth}>
                {/* ^ Click focus handler could be improved */}
                {history.map((line, i) => (
                    <pre key={i} className={`whitespace-pre-wrap break-words ${line.startsWith("$") ? getColorClass("ascii-highlight") : getColorClass("ascii-text")}`}>
                        {line}
                    </pre>
                ))}
                <div className="flex items-center mt-2">
                    <span className={`${getColorClass("ascii-highlight")} mr-2`}>$</span>
                    <form onSubmit={handleSubmit} className="flex-1">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            className={`bg-transparent border-none outline-none w-full typing-cursor ${getColorClass("ascii-text")}`}
                            autoFocus
                            placeholder="Type a command..."
                        />
                    </form>
                </div>
            </div>

            {/* Footer / Resize Handle */}
            <div className="p-1 px-4 flex justify-between items-center text-xs opacity-50 bg-black/20">
                <span className={getColorClass("ascii-dim")}>
                    v2.0 | {isMaximized ? 'FULLSCREEN' : `${size.w}x${size.h}`}
                </span>
                {!isMaximized && (
                    <div
                        className="cursor-nwse-resize w-4 h-4 flex items-center justify-center"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsResizing(true);
                        }}
                    >
                        ◢
                    </div>
                )}
            </div>
        </div>
    );
};

export default TerminalCommand;
