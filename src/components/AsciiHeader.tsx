import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";

const AsciiHeader = () => {
  const { user } = useAuth();

  return (
    <header className="ascii-text mb-6">
      <div className="relative flex items-center justify-center gap-6">
        {/* ASCII Title */}
        <pre className="text-center ascii-highlight font-mono leading-[0.85] text-[18px] sm:text-[22px] md:text-[26px] lg:text-[30px]">
          {`╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║     ███████╗██╗███╗   ██╗     ██████╗██╗████████╗██╗   ██╗                     ║
║     ██╔════╝██║████╗  ██║    ██╔════╝██║╚══██╔══╝╚██╗ ██╔╝                     ║
║     ███████╗██║██╔██╗ ██║    ██║     ██║   ██║    ╚████╔╝                      ║
║     ╚════██║██║██║╚██╗██║    ██║     ██║   ██║     ╚██╔╝                       ║
║     ███████║██║██║ ╚████║    ╚██████╗██║   ██║      ██║                        ║
║     ╚══════╝╚═╝╚═╝  ╚═══╝     ╚═════╝╚═╝   ╚═╝      ╚═╝                        ║
║                                                                                ║
╚══════════════════════════════════════════════════════════════════════════════╝`}
        </pre>

        {/* Moth/Cicada Logo Image */}
        <div className="hidden sm:block flex-shrink-0">
          <img
            src="/images/moth-logo.png"
            alt="Sin City Moth Logo"
            className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-lg transition-shadow duration-300"
          />
        </div>

        {/* Notification Bell - Top Right */}
        {user && (
          <div className="absolute top-0 right-0">
            <NotificationBell />
          </div>
        )}
      </div>
      {/* Tagline removed per request */}
    </header>
  );
};

export default AsciiHeader;
