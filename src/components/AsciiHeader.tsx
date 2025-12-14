import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";

const AsciiHeader = () => {
  const { user } = useAuth();

  return (
    <header className="ascii-text mb-4 sm:mb-6">
      <div className="relative">
        {/* Main horizontal layout container */}
        <div className="ascii-box p-3 sm:p-4 md:p-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          {/* SIN CITY Title - Simple text that works on all browsers */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="ascii-highlight font-mono font-bold tracking-widest text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
              SIN CITY
            </h1>
            <div className="ascii-dim text-xs sm:text-sm mt-1">
              ═══════════════════════════
            </div>
          </div>

          {/* Cicada Logo - Right side */}
          <div className="flex items-center justify-center flex-shrink-0">
            <img
              src="/images/cicada.png?v=3"
              alt="Sin City Cicada Logo"
              className="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 object-contain opacity-90 hover:opacity-100 transition-opacity duration-300"
            />
          </div>
        </div>

        {/* Notification Bell - Top Right */}
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
