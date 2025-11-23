import { useEffect, useState } from "react";

const AsciiFooter = () => {
  const [uptime, setUptime] = useState(0);
  const [visitors, setVisitors] = useState(0);

  useEffect(() => {
    // Simulate uptime counter
    const startTime = Date.now();
    const interval = setInterval(() => {
      setUptime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Get visitor count from localStorage
    const count = parseInt(localStorage.getItem("visitorCount") || "0") + 1;
    localStorage.setItem("visitorCount", count.toString());
    setVisitors(count);

    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <footer className="ascii-text mt-12 pt-6 border-t border-ascii-border">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* System Info */}
        <div className="ascii-box bg-secondary/20 p-4">
          <pre className="ascii-highlight text-xs mb-2">SYSTEM INFO</pre>
          <pre className="ascii-dim text-xs">
            {`Uptime: ${formatUptime(uptime)}
Visitors: ${visitors.toString().padStart(6, "0")}
Status: ONLINE`}
          </pre>
        </div>

        {/* Navigation */}
        <div className="ascii-box bg-secondary/20 p-4">
          <pre className="ascii-highlight text-xs mb-2">QUICK LINKS</pre>
          <pre className="ascii-text text-xs">
            {`[HOME]  [POSTS]  [ABOUT]
[LOGIN] [MANAGE] [CONTACT]`}
          </pre>
        </div>

        {/* ASCII Art */}
        <div className="ascii-box bg-secondary/20 p-4">
          <pre className="ascii-highlight text-xs">
            {`   ___
  /   \\
 | o o |
  \\ ^ /
   |||
   |||`}
          </pre>
        </div>
      </div>

      <div className="text-center">
        <pre className="ascii-dim text-xs">
          {`╔════════════════════════════════════════════════════════════╗
║  SIN CITY © 2025 | Built with ♥ and ASCII                 ║
║  Press '?' for keyboard shortcuts | '~' for terminal      ║
╚════════════════════════════════════════════════════════════╝`}
        </pre>
      </div>
    </footer>
  );
};

export default AsciiFooter;