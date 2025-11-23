import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Index from "./pages/Index";
import ManagePosts from "./pages/ManagePosts";
import NotFound from "./pages/NotFound";
import Posts from "./pages/Posts";
import PostDetail from "./pages/PostDetail";
import SearchResults from "./pages/SearchResults";
import UserProfile from "./pages/UserProfile";
import Bookmarks from "./pages/Bookmarks";
import CreatePost from "./pages/CreatePost";
import About from "./pages/About";
import Contact from "./pages/Contact";
import BootSequence from "./components/BootSequence";
import ScanlineEffect from "./components/ScanlineEffect";
import TerminalCommand from "./components/TerminalCommand";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

const queryClient = new QueryClient();

const AppContent = () => {
  const [showTerminal, setShowTerminal] = useState(false);

  useKeyboardShortcuts({
    onHelp: () => {
      // Help is handled per-page
    },
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
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/manage" element={<ManagePosts />} />
        <Route path="/posts" element={<Posts />} />
        <Route path="/post/:slug" element={<PostDetail />} />
        <Route path="/search" element={<SearchResults />} />
        <Route path="/user/:username" element={<UserProfile />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/create" element={<CreatePost />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => {
  const [showBoot, setShowBoot] = useState(true);
  const [hasBooted, setHasBooted] = useState(false);

  useEffect(() => {
    // Check if user has already seen boot sequence in this session
    const booted = sessionStorage.getItem("hasBooted");
    if (booted) {
      setShowBoot(false);
      setHasBooted(true);
    }
  }, []);

  const handleBootComplete = () => {
    sessionStorage.setItem("hasBooted", "true");
    setShowBoot(false);
    setHasBooted(true);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            {showBoot && !hasBooted ? (
              <BootSequence onComplete={handleBootComplete} />
            ) : (
              <AppContent />
            )}
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
