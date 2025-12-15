import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
    children: ReactNode;
}

const PageTransition = ({ children }: PageTransitionProps) => {
    const location = useLocation();
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [displayChildren, setDisplayChildren] = useState(children);

    useEffect(() => {
        // Start transition
        setIsTransitioning(true);

        // Short delay for fade out
        const fadeOutTimer = setTimeout(() => {
            setDisplayChildren(children);

            // Fade in after content change
            const fadeInTimer = setTimeout(() => {
                setIsTransitioning(false);
            }, 50);

            return () => clearTimeout(fadeInTimer);
        }, 150);

        return () => clearTimeout(fadeOutTimer);
    }, [location.pathname, children]);

    return (
        <div className="relative">
            {/* Scanline sweep effect during transition */}
            {isTransitioning && (
                <div
                    className="fixed inset-0 z-50 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to bottom, transparent 0%, rgba(0, 255, 0, 0.1) 50%, transparent 100%)',
                        animation: 'scanline-sweep 0.3s ease-out forwards'
                    }}
                />
            )}

            {/* Content with fade effect */}
            <div
                className={`transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'
                    }`}
            >
                {displayChildren}
            </div>

            {/* CSS for scanline animation */}
            <style>{`
        @keyframes scanline-sweep {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(100%);
          }
        }
      `}</style>
        </div>
    );
};

export default PageTransition;
