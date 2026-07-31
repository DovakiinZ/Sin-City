import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
    children: ReactNode;
}

const PageTransition = ({ children }: PageTransitionProps) => {
    const location = useLocation();
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Trigger the fade ONLY on real navigation (pathname change). Depending on
    // `children` here re-fires on every parent re-render — and because the
    // cleanup clears the "fade back in" timer, frequent re-renders (e.g. the
    // /verify page mounts useVerification in three places) leave the page stuck
    // at opacity-0 with the sweep looping and inputs unusable. Keying on
    // pathname makes the transition self-healing: non-navigation re-renders
    // never retrigger or freeze it.
    useEffect(() => {
        setIsTransitioning(true);
        const fadeTimer = setTimeout(() => setIsTransitioning(false), 150);
        return () => clearTimeout(fadeTimer);
    }, [location.pathname]);

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

            {/* Content with fade effect — always render live children so state
                updates within the current route (typing the OTP, etc.) show
                immediately and never render a stale snapshot. */}
            <div
                className={`transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'
                    }`}
            >
                {children}
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
