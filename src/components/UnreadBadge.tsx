interface UnreadBadgeProps {
    count?: number;
    className?: string;
}

const UnreadBadge = ({ count = 0, className = "" }: UnreadBadgeProps) => {
    return (
        <div className={`relative inline-flex items-center justify-center ${className}`}>
            {/* Core glowing dot / badge container */}
            <div
                className={`
                flex items-center justify-center
                bg-red-600/90 text-white font-mono font-bold
                shadow-[0_0_10px_rgba(220,38,38,0.8)]
                border border-red-400/50
                backdrop-blur-sm
                transition-all duration-300 ease-out scale-100
                ${count > 0 ? 'min-w-[1.25rem] h-5 px-1 rounded-full text-[10px]' : 'w-2.5 h-2.5 rounded-full'}
            `}
            >
                {/* Glitch overlay effect */}
                <div className="absolute inset-0 bg-red-500/20 animate-pulse rounded-full" />

                {/* Content */}
                {count > 0 && (
                    <span className="relative z-10 leading-none pt-[1px]">
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </div>

            {/* Ambient glow effect (pulsing ring using Tailwind animate-ping or custom) */}
            <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping opacity-50" />
        </div>
    );
};

export default UnreadBadge;
