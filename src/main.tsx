import "./polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Unregister any lingering service workers that might intercept and hang fetch requests
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    for (let registration of registrations) {
      registration.unregister()
    }
  }).catch(function (err) {
    console.log('Service Worker registration failed: ', err);
  });
}

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
