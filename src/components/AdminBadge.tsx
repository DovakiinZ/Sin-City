import { cn } from "@/lib/utils";

type AdminBadgeVariant = "default" | "glitch" | "crown" | "root" | "cyber";

interface AdminBadgeProps {
    variant?: AdminBadgeVariant;
    className?: string;
}

/**
 * Cool admin badge component with multiple style variants
 * Fits the terminal/ASCII theme of Sin City
 */
export default function AdminBadge({ variant = "default", className }: AdminBadgeProps) {
    const badges: Record<AdminBadgeVariant, { text: string; style: string }> = {
        default: {
            text: "⚡ADMIN",
            style: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_6px_rgba(234,179,8,0.4)]",
        },
        glitch: {
            text: "▓ ADMIN ▓",
            style: "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]",
        },
        crown: {
            text: "👑 ADMIN",
            style: "bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-[0_0_6px_rgba(168,85,247,0.4)]",
        },
        root: {
            text: "[ROOT]",
            style: "bg-green-500/20 text-green-300 border-green-400/50 font-bold shadow-[0_0_6px_rgba(34,197,94,0.4)]",
        },
        cyber: {
            text: "◆ ΩDMIN ◆",
            style: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.5)]",
        },
    };

    const { text, style } = badges[variant];

    return (
        <span
            className={cn(
                "inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono border rounded uppercase tracking-wider",
                style,
                className
            )}
        >
            {text}
        </span>
    );
}
