import { Link, useLocation } from "react-router-dom";

export default function AsciiSidebar() {
  const location = useLocation();
  const navItems = [
    { label: "Home", href: "/" },
    { label: "Manage", href: "/manage" },
    { label: "Posts", href: "/posts" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ];

  return (
    <aside className="ascii-text p-4">
      <pre className="ascii-dim">
{`+---------------------+
|     NAVIGATION      |
+---------------------+`}
      </pre>
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

      <pre className="mt-6 ascii-dim text-xs">
{`+---------------------+
|       STATUS        |
+---------------------+
| Online:  yes        |
| Posts:   42         |
| Views:   1,337      |
+---------------------+`}
      </pre>
    </aside>
  );
}
