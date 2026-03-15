import "./polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Silence all console output in production (admin sees Vercel logs instead)
if (!import.meta.env.DEV) {
  const noop = () => {};
  console.log = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
  // console.error is kept so real crashes still show
}

createRoot(document.getElementById("root")!).render(<App />);
