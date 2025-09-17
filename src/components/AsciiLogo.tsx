import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

type Variant = "boxed" | "plain";

export default function AsciiLogo({ className = "", variant = "boxed" }: { className?: string; variant?: Variant }) {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/logo.txt")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((txt) => {
        if (!cancelled) setLogo(txt);
      })
      .catch(() => {
        if (!cancelled)
          setLogo(`
   _   _
 _( )_( )_
(_   V   _)
  |     |
   \   /
    \_/
`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preBaseClass =
    variant === "plain"
      ? "ascii-text whitespace-pre leading-[0.9]"
      : "ascii-text whitespace-pre leading-[0.9] overflow-auto max-h-48 p-2 border border-dashed border-neutral-700 rounded text-[10px] sm:text-xs md:text-sm";

  return (
    <Link to="/" aria-label="Home" className={"block select-text " + className}>
      <pre className={preBaseClass}>
{logo ?? "Loading..."}
      </pre>
    </Link>
  );
}
