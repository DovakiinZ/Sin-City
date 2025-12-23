import { useState, useEffect } from "react";
import { Terminal } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import MatrixRain from "@/components/effects/MatrixRain";
import useKonamiCode from "@/hooks/useKonamiCode";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import ProfileEdit from "./pages/ProfileEdit";
import Index from "./pages/Index";
import ManagePosts from "./pages/ManagePosts";
import NotFound from "./pages/NotFound";
import Posts from "./pages/Posts";
import PostDetail from "./pages/PostDetail";
import SearchResults from "./pages/SearchResults";
import UserProfile from "./pages/UserProfile";
import Bookmarks from "./pages/Bookmarks";
import CreatePost from "./pages/CreatePost";
import Drafts from "./pages/Drafts";
import AdminDashboard from "./pages/AdminDashboard";
import About from "./pages/About";
import Contact from "./pages/Contact";
import AsciiTools from "./pages/AsciiTools";
import ThreadView from "./pages/ThreadView";
import QuickCreateButton from "./components/QuickCreateButton";
import BootSequence from "./components/BootSequence";
import ScanlineEffect from "./components/ScanlineEffect";
import TerminalCommand from "./components/TerminalCommand";
import PageTransition from "./components/PageTransition";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUserIPCapture } from "./hooks/useUserIPCapture";
import useGuestFingerprint from "./hooks/useGuestFingerprint";
import MessagingPanel from "./components/messaging/MessagingPanel";

const queryClient = new QueryClient();

const AppContent = () => {
  const [showTerminal, setShowTerminal] = useState(false);
  const { user, loading } = useAuth();
  const location = useLocation();
  const showMatrix = useKonamiCode();

  // Capture IP for logged-in users
  useUserIPCapture();

  // Capture Guest Fingerprint & Logging
  const { createOrUpdateGuest, fingerprint } = useGuestFingerprint();

  useEffect(() => {
    // If not loading and no user, log as guest
    if (!loading && !user && fingerprint) {
      const hasLogged = sessionStorage.getItem(`guest_logged_${fingerprint}`);
      if (!hasLogged) {
        createOrUpdateGuest().then(() => {
          sessionStorage.setItem(`guest_logged_${fingerprint}`, 'true');
        });
      }
    }
  }, [loading, user, fingerprint, createOrUpdateGuest]);

  // Handle password recovery redirect
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      // If we're not already on the reset-password page, redirect there
      if (location.pathname !== '/reset-password') {
        window.location.href = `/reset-password${hash}`;
      }
    }
  }, [location.pathname]);

  useKeyboardShortcuts({
    onHelp: () => {
      console.log("Help triggered");
    },
    onTerminal: () => setShowTerminal(!showTerminal),
  });

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "~" || e.key === "`") {
        e.preventDefault();
        setShowTerminal(!showTerminal);
      }
      if (e.key === "Escape" && showTerminal) {
        setShowTerminal(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [showTerminal]);

  return (
    <>
      <ScanlineEffect />
      {showTerminal && <TerminalCommand onClose={() => setShowTerminal(false)} />}
      <PageTransition>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/manage" element={<ManagePosts />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/post/:slug" element={<PostDetail />} />
          <Route path="/thread/:threadId" element={<ThreadView />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/user/:username" element={<UserProfile />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/drafts" element={<Drafts />} />
          <Route path="/create" element={<CreatePost />} />
          <Route path="/crowd" element={<AdminDashboard />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/ascii" element={<AsciiTools />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/edit" element={<ProfileEdit />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageTransition>

      {/* Quick Create FAB - hidden on mobile to avoid conflict with terminal */}
      <div className="hidden md:block">
        <QuickCreateButton />
      </div>

      {/* Messaging Panel */}
      <MessagingPanel />
    </>
  );
};

const App = () => {
  const [showBoot, setShowBoot] = useState(true);
  const [hasBooted, setHasBooted] = useState(false);

  useEffect(() => {
    // Check if user has already seen boot sequence in this session
    const booted = sessionStorage.getItem("hasBooted");
    // Skip boot sequence if there's a password recovery token
    const hash = window.location.hash;
    const isRecovery = hash && hash.includes('type=recovery');

    if (booted || isRecovery) {
      setShowBoot(false);
      setHasBooted(true);
      if (isRecovery) {
        sessionStorage.setItem("hasBooted", "true");
      }
    }
  }, []);

  const handleBootComplete = () => {
    sessionStorage.setItem("hasBooted", "true");
    setShowBoot(false);
    setHasBooted(true);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <TooltipProvider>
              {hasBooted ? <AppContent /> : <BootSequence onComplete={handleBootComplete} />}
              <Toaster />
              <Sonner />
              <Analytics />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
