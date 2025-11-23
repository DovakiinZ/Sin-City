import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";

export default function AsciiSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const baseItems = [
    { label: "Home", href: "/" },
    { label: "Manage", href: "/manage" },
import { Link } from "react-router-dom";
  import SearchBar from "./search/SearchBar";
  import TagCloud from "./tags/TagCloud";
  import PopularPosts from "./analytics/PopularPosts";

  const AsciiSidebar = () => {
    return (
      <aside className="space-y-6">
        {/* Search */}
        <div>
          <SearchBar />
        </div>

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
              <Link to="/posts" className="ascii-nav-link hover:ascii-highlight">
                → Posts
              </Link>
            </li>
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
            <li>
              <Link to="/manage" className="ascii-nav-link hover:ascii-highlight">
                → Manage Posts
              </Link>
            </li>
          </ul>
        </nav>

        {/* Popular/Trending Posts */}
        <PopularPosts />

        {/* Tag Cloud */}
        <TagCloud />

        {/* System Info */}
        <div className="ascii-box p-4">
          <pre className="ascii-highlight text-xs mb-2">SYSTEM</pre>
          <div className="ascii-dim text-xs space-y-1">
            <div>Status: ONLINE</div>
            <div>Mode: ASCII</div>
            <div>Theme: Terminal</div>
          </div>
        </div>
      </aside>
    );
  };

  export default AsciiSidebar;
