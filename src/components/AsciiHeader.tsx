import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";

const AsciiHeader = () => {
  const { user } = useAuth();

  return (
    <header className="ascii-text mb-6">
      <div className="relative">
        {/* Main horizontal layout container */}
        <div className="ascii-box p-6 flex items-center justify-between gap-4">
          {/* ASCII Title - Left side */}
          <div className="flex-1">
            <pre className="ascii-highlight font-mono leading-[0.9] text-[24px] sm:text-[32px] md:text-[40px] lg:text-[48px]">
              {`███████╗██╗███╗   ██╗     ██████╗██╗████████╗██╗   ██╗
██╔════╝██║████╗  ██║    ██╔════╝██║╚══██╔══╝╚██╗ ██╔╝
███████╗██║██╔██╗ ██║    ██║     ██║   ██║    ╚████╔╝ 
╚════██║██║██║╚██╗██║    ██║     ██║   ██║     ╚██╔╝  
███████║██║██║ ╚████║    ╚██████╗██║   ██║      ██║   
╚══════╝╚═╝╚═╝  ╚═══╝     ╚═════╝╚═╝   ╚═╝      ╚═╝`}
            </pre>
          </div>

          {/* Cicada Logo - Right side */}
          <div className="flex items-center justify-center">
            <img
              src="/images/cicada.png?v=3"
              alt="Sin City Cicada Logo"
              className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 object-contain opacity-90 hover:opacity-100 transition-opacity duration-300"
            />
          </div>
        </div>

        {/* Notification Bell - Top Right */}
        {user && (
          <div className="absolute top-2 right-2">
            <NotificationBell />
          </div>
        )}
      </div>
    </header>
  );
};

export default AsciiHeader;
