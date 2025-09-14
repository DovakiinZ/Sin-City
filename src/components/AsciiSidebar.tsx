const AsciiSidebar = () => {
  const navItems = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" }
  ];

  return (
    <aside className="ascii-text">
      <pre className="ascii-dim">
{`┌─────────────────┐
│   NAVIGATION    │
└─────────────────┘`}
      </pre>
      <nav className="mt-4 space-y-2">
        {navItems.map((item, index) => (
          <div key={index} className="ascii-text">
            <span className="ascii-dim">│ </span>
            <a href={item.href} className="ascii-nav-link hover:ascii-highlight transition-colors">
              ► {item.label}
            </a>
          </div>
        ))}
      </nav>
      <pre className="mt-6 ascii-dim text-xs">
{`┌─────────────────┐
│     STATUS      │
└─────────────────┘
│ Online: ████░░░ │
│ Posts: 42       │
│ Views: 1,337    │
└─────────────────┘`}
      </pre>
    </aside>
  );
};

export default AsciiSidebar;