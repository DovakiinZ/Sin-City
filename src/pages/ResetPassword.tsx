import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
    const { updatePassword } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check if we have a valid session (user clicked the email link)
    useEffect(() => {
        // Supabase automatically handles the token from the URL
        // and updates the session
    }, []);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        // Validate passwords match
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        // Validate password strength
        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        setLoading(true);
        try {
            await updatePassword(newPassword);
            toast({
                title: "Success",
                description: "Your password has been updated.",
            });
            // Redirect to login after a short delay
            setTimeout(() => {
                navigate("/login");
            }, 1500);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to update password";
            setError(message);
            toast({
                title: "Error",
                description: message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
                <div className="mb-2"><BackButton /></div>
                <div className="ascii-highlight mb-4 text-xl">+-- Set New Password --+</div>
                {error && <div className="text-red-400 mb-3">{error}</div>}
                <form onSubmit={onSubmit} className="space-y-3">
                    <label className="block">
                        <div className="ascii-dim text-xs mb-1">New Password</div>
                        <input
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                            required
                            type="password"
                            disabled={loading}
                            minLength={6}
                        />
                    </label>
                    <label className="block">
                        <div className="ascii-dim text-xs mb-1">Confirm New Password</div>
                        <input
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                            required
                            type="password"
                            disabled={loading}
                            minLength={6}
                        />
                    </label>
                    <button
                        className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50 w-full"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Updating..." : "Update Password"}
                    </button>
                </form>
            </div>
        </div>
    );
}
