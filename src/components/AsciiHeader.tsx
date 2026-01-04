import NotificationBell from "@/components/notifications/NotificationBell";
import { useAuth } from "@/context/AuthContext";
import { useDeviceDetect } from "@/hooks/useDeviceDetect";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { MessageCircle } from "lucide-react";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import UnreadBadge from "./UnreadBadge";

const AsciiHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isMobile, isIOS, isAndroid } = useDeviceDetect();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const { totalUnread } = useUnreadCount();

  // Fetch user avatar
  useEffect(() => {
    async function fetchAvatar() {
      if (!user?.id) return;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .single();
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
      } catch (error) {
        console.error("Error fetching avatar:", error);
      }
    }
    fetchAvatar();
  }, [user?.id]);

  const isMobileDevice = isMobile || isIOS || isAndroid;

  return (
    <header className="mb-4 sm:mb-6">
      <div className={`
        bg-black/50 border border-green-800/40 rounded-lg
        ${isMobileDevice ? 'px-3 py-2' : 'px-6 py-4'}
      `}>
        {/* Unified 3-column layout: Logo Left | Cicada Center | Icons Right */}
        <div className="flex items-center justify-between">

          {/* Left: SIN CITY Text Logo - Clickable */}
          <button onClick={() => navigate("/")} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            <h1 className={`
              font-mono font-bold tracking-widest text-green-400
              ${isMobileDevice ? 'text-lg' : 'text-2xl md:text-3xl lg:text-4xl'}
            `}>
              SIN CITY
            </h1>
          </button>

          {/* Center: Cicada Logo - Clickable */}
          <button onClick={() => navigate("/")} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            <img
              src="/images/cicada.png?v=3"
              alt="Cicada"
              className={`
                object-contain opacity-90 hover:opacity-100 transition-opacity duration-300
                mix-blend-screen brightness-75 contrast-150
                ${isMobileDevice ? 'w-20 h-20' : 'w-28 h-28 md:w-32 md:h-32 lg:w-36 lg:h-36'}
              `}
            />
          </button>

          {/* Right: Notifications + Profile */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Notification Bell - Both mobile and desktop */}
            {user && (
              <div className="p-1">
                <NotificationBell />
              </div>
            )}

            {/* Messages Icon */}
            {user && (
              <button
                onClick={() => navigate("/chat")}
                className={`
                  relative p-2 text-green-400 hover:text-green-300 hover:bg-green-900/30 
                  rounded-lg transition-colors
                `}
                title="Messages"
              >
                <MessageCircle className={isMobileDevice ? 'w-5 h-5' : 'w-6 h-6'} />
                {totalUnread > 0 && (
                  <div className="absolute -top-1 -right-1">
                    <UnreadBadge count={totalUnread} />
                  </div>
                )}
              </button>
            )}

            {/* Profile Icon */}
            {user && (
              <button
                onClick={() => navigate("/profile")}
                className={`
                  rounded-full overflow-hidden border-2 border-green-600 
                  hover:border-green-400 transition-colors
                  ${isMobileDevice ? 'w-8 h-8' : 'w-10 h-10'}
                `}
                title="Profile"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-green-900/50 flex items-center justify-center">
                    <span className={`text-green-400 font-medium ${isMobileDevice ? 'text-xs' : 'text-sm'}`}>
                      {user.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?"}
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AsciiHeader;
