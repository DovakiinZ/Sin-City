import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// Redirect to the unified UserProfile page for the current user
export default function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (user?.username) {
        // Redirect to unified profile page
        navigate(`/user/${user.username}`, { replace: true });
      } else if (!user) {
        // Not logged in, redirect to login
        navigate("/login", { replace: true });
      }
    }
  }, [user, loading, navigate]);

  // Show loading while checking auth
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="inline-block w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
