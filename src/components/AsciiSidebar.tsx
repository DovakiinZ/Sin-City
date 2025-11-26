import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import SearchBar from "./search/SearchBar";
import TagCloud from "./tags/TagCloud";
import PopularPosts from "./analytics/PopularPosts";
import BackButton from "@/components/BackButton";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import HearThisButton from "@/components/HearThisButton";

const AsciiSidebar = () => {
  const { user, logout } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) {
      console.log('[Admin Check] No user logged in');
      setIsAdmin(false);
      return;
    }

    console.log('[Admin Check] Checking admin status for user:', user.id);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      console.log('[Admin Check] Supabase response:', { data, error });

      if (error) {
        console.error('[Admin Check] Error fetching role:', error);
        setIsAdmin(false);
        return;
      }

      if (data?.role === 'admin') {
        console.log('[Admin Check] ✅ User IS admin');
        setIsAdmin(true);
      } else {
        console.log('[Admin Check] ❌ User is NOT admin. Role:', data?.role);
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('[Admin Check] Exception:', error);
      setIsAdmin(false);
    }
  };

  return (
    <aside className="space-y-6">
      {/* Search */}
      <div>
        <SearchBar />
      </div>

      {/* Music Button */}
      <HearThisButton />

      {/* Navigation */}
      <nav className="ascii-box p-4">
        <pre className="ascii-highlight text-xs mb-3">NAVIGATION</pre>
        <ul className="space-y-2 text-sm">
          <li>
            <Link to="/" className="ascii-nav-link hover:ascii-highlight">
              → Home
            </Link>
          </li>
          <li>
            <Link to="/create" className="ascii-nav-link hover:ascii-highlight">
              → Create Post
            </Link>
          </li>
          <li>
            <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">
              → Posts
            </Link>
          </li>
          <li>
            <Link to="/manage" className="ascii-nav-link hover:ascii-highlight">
              → Manage Posts
            </Link>
          </li>
          {isAdmin && (
            <li>
              <Link to="/admin" className="ascii-nav-link hover:ascii-highlight text-yellow-500">
                → Admin Console
              </Link>
            </li>
          )}
          <li>
            <Link to="/about" className="ascii-nav-link hover:ascii-highlight">
              → About
            </Link>
          </li>
          <li>
            <Link to="/contact" className="ascii-nav-link hover:ascii-highlight">
              → Contact
            </Link>
          </li>
          {user ? (
            <>
              <li>
                <Link to="/profile" className="ascii-nav-link hover:ascii-highlight">
                  → Profile
                </Link>
              </li>
              <li>
                <Link to="/bookmarks" className="ascii-nav-link hover:ascii-highlight">
                  → Bookmarks
                </Link>
              </li>
              <li className="pt-2 border-t border-ascii-border mt-2">
                <button onClick={logout} className="ascii-nav-link hover:ascii-highlight text-red-400">
                  → Logout
                </button>
              </li>
            </>
          ) : (
            <>
              <li className="pt-2 border-t border-ascii-border mt-2">
                <Link to="/login" className="ascii-nav-link hover:ascii-highlight">
                  → Login
                </Link>
              </li>
              <li>
                <Link to="/register" className="ascii-nav-link hover:ascii-highlight">
                  → Register
                </Link>
              </li>
            </>
          )}
        </ul>
      </nav>

      {/* Popular/Trending Posts */}
      <PopularPosts />

      {/* Tag Cloud */}
      <TagCloud />

      {/* System Info */}
      <div className="ascii-box p-4">
        <div className="flex justify-between items-start mb-2">
          <pre className="ascii-highlight text-xs">SYSTEM</pre>
          <ThemeSwitcher />
        </div>
        <div className="ascii-dim text-xs space-y-1">
          <div>Status: ONLINE</div>
          <div>Mode: ASCII</div>
          <div>Theme: Terminal</div>
          {user && <div>User: {user.email?.split('@')[0]}</div>}
        </div>
      </div>
    </aside>
  );
};

export default AsciiSidebar;
