import NotificationBell from "@/components/notifications/NotificationBell";
import MobileMenu from "@/components/MobileMenu";
import { useAuth } from "@/context/AuthContext";
import { useDeviceDetect } from "@/hooks/useDeviceDetect";

const AsciiHeader = () => {
  const { user } = useAuth();
  const { isMobile, isIOS, isAndroid } = useDeviceDetect();

  // Different header for mobile (iOS/Android) vs desktop web
  const isMobileDevice = isMobile || isIOS || isAndroid;

  return (
    <header className="ascii-text mb-4 sm:mb-6">
      <div className="relative">
        <div className="ascii-box p-3 sm:p-4 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">

          {/* Mobile Menu Button - Left side */}
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10">
            <MobileMenu />
          </div>

          {isMobileDevice ? (
            /* MOBILE: Simple clean text header */
            <div className="flex-1 text-center">
              <h1 className="ascii-highlight font-mono font-bold tracking-widest text-xl">
                ▓ SIN CITY ▓
              </h1>
            </div>
          ) : (
            /* DESKTOP: Simple SIN CITY text like original but clean */
            <div className="flex-1">
              <h1 className="ascii-highlight font-mono text-3xl md:text-4xl lg:text-5xl font-bold tracking-widest">
                SIN CITY
              </h1>
              <div className="ascii-dim text-sm mt-1">
                ═══════════════════════════════════════
              </div>
            </div>
          )}

          {/* Cicada Logo */}
          <div className="flex items-center justify-center flex-shrink-0">
            <img
              src="/images/cicada.png?v=3"
              alt="Sin City Cicada Logo"
              className={isMobileDevice
                ? "w-16 h-16 object-contain opacity-90 hover:opacity-100 transition-opacity duration-300 mix-blend-screen brightness-90 contrast-125"
                : "w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 object-contain opacity-90 hover:opacity-100 transition-opacity duration-300 mix-blend-screen brightness-90 contrast-125"
              }
            />
          </div>
        </div>

        {/* Notification Bell */}
        {user && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-black/80 border-2 border-green-500 rounded-lg p-1 shadow-lg shadow-green-900/50 z-10">
            <NotificationBell />
          </div>
        )}
      </div>
    </header>
  );
};

export default AsciiHeader;

