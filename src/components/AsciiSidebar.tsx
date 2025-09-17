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
    { label: "Posts", href: "/posts" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ];
  const navItems = user
    ? [...baseItems, { label: "Profile", href: "/profile" }]
    : [...baseItems, { label: "Login", href: "/login" }, { label: "Register", href: "/register" }];

  return (
    <aside className="ascii-text p-4">
      <div className="mb-4">
        <BackButton />
      </div>
      <nav className="mt-4 space-y-2">
        {navItems.map((item) => {
          const active = location.pathname === item.href;
          return (
            <div key={item.href} className="ascii-text">
              <span className="ascii-dim">» </span>
              <Link
                to={item.href}
                className={
                  "ascii-nav-link transition-colors " +
                  (active ? "ascii-highlight" : "hover:ascii-highlight")
                }
              >
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
      {user && (
        <div className="mt-6 ascii-dim text-xs">
          <div className="mb-2">Signed in as <span className="ascii-highlight">{user.displayName}</span></div>
          <button onClick={logout} className="ascii-nav-link hover:ascii-highlight">Logout</button>
        </div>
      )}
    </aside>
  );
}
