export default function AsciiSidebar() {
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
        {navItems.map((item) => (
          <div key={item.href} className="ascii-text">
            <span className="ascii-dim">» </span>
            <a href={item.href} className="ascii-nav-link hover:ascii-highlight transition-colors">
              {item.label}
            </a>
          </div>
        ))}
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

