import { useNavigate } from "react-router-dom";

export default function BackButton({ label = "\u2190 Back", className = "" }: { label?: string; className?: string }) {
  const navigate = useNavigate();
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }
  return (
    <button
      type="button"
      onClick={goBack}
      className={("ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 " + className).trim()}
      aria-label="Go back"
    >
      {label}
    </button>
  );
}

