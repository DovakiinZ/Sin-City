import { useState } from "react";
import AsciiHeader from "@/components/AsciiHeader";
import AsciiFooter from "@/components/AsciiFooter";
import { Link } from "react-router-dom";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const NotFound = () => {
  const [showHelp, setShowHelp] = useState(false);

  useKeyboardShortcuts({
    onHelp: () => setShowHelp(!showHelp),
  });

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <AsciiHeader />

        <main className="ascii-text flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <pre className="ascii-highlight mb-8 text-sm sm:text-base">
              {`╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                    FATAL SYSTEM ERROR                         ║
║                                                               ║
║   Error Code: 0x404                                           ║
║   Description: PAGE_NOT_FOUND                                 ║
║                                                               ║
║   The requested resource does not exist in the system.        ║
║                                                               ║
║   Press any key to return to safety...                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝`}
            </pre>

            <div className="space-y-4">
              <pre className="ascii-dim text-xs">
                {`System Halted.
Memory Dump: 0x00000000
Stack Trace: [REDACTED]`}
              </pre>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
                <Link
                  to="/"
                  className="ascii-box bg-secondary/30 px-6 py-3 hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <pre className="ascii-text">[RETURN TO HOME]</pre>
                </Link>

                <Link
                  to="/posts"
                  className="ascii-box bg-secondary/30 px-6 py-3 hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <pre className="ascii-text">[VIEW POSTS]</pre>
                </Link>
              </div>

              <pre className="ascii-dim text-xs mt-8">
                {`Tip: Press '?' for keyboard shortcuts`}
              </pre>
            </div>

            {showHelp && (
              <div className="mt-8 ascii-box bg-secondary/50 p-4 inline-block">
                <pre className="ascii-text text-xs text-left">
                  {`╔═══ KEYBOARD SHORTCUTS ═══╗
║ j/k    - Scroll down/up  ║
║ g/G    - Top/Bottom      ║
║ /      - Search          ║
║ ?      - Toggle help     ║
║ Esc    - Close           ║
╚══════════════════════════╝`}
                </pre>
              </div>
            )}
          </div>
        </main>

        <AsciiFooter />
      </div>
    </div>
  );
};

export default NotFound;
