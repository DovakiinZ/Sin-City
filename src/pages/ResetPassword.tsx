import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
    const { user, loading, updatePassword } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isRecoverySession, setIsRecoverySession] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [linkError, setLinkError] = useState<string | null>(null);

    // Check if this is a password recovery session
    useEffect(() => {
        async function checkRecoverySession() {
            try {
                // Check if there's a recovery token in the URL
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                const accessToken = hashParams.get('access_token');
                const type = hashParams.get('type');
                const error = hashParams.get('error');
                const errorCode = hashParams.get('error_code');
                const errorDescription = hashParams.get('error_description');

                console.log('Recovery check:', {
                    hash: window.location.hash,
                    type,
                    hasToken: !!accessToken,
                    error,
                    errorCode
                });

                // Check for errors in the URL (expired link, etc.)
                if (error || errorCode) {
                    let errorMessage = 'The password reset link is invalid.';

                    if (errorCode === 'otp_expired') {
                        errorMessage = 'This password reset link has expired. Please request a new one.';
                    } else if (errorDescription) {
                        errorMessage = decodeURIComponent(errorDescription.replace(/\+/g, ' '));
                    }

                    setLinkError(errorMessage);
                    setCheckingSession(false);
                    return;
                }

                if (type === 'recovery' && accessToken) {
                    console.log('✅ Recovery session detected from URL');
                    setIsRecoverySession(true);
                } else if (supabase) {
                    // Check if current session is a recovery session
                    const { data: { session } } = await supabase.auth.getSession();
                    console.log('Session check:', {
                        hasSession: !!session,
                        hasUser: !!session?.user
                    });
                    if (session?.user) {
                        setIsRecoverySession(true);
                    }
                }
            } catch (err) {
                console.error("Error checking recovery session:", err);
            } finally {
                setCheckingSession(false);
            }
        }

        checkRecoverySession();
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

        setSubmitting(true);
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
            setSubmitting(false);
        }
    }

    // Show loading while auth context initializes or checking recovery session
    if (loading || checkingSession) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
                    <div className="ascii-dim text-center">Loading...</div>
                </div>
            </div>
        );
    }

    // Show error if link is expired or invalid
    if (linkError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md mx-auto font-mono border border-red-700 p-4 bg-black/70">
                    <div className="mb-2"><BackButton /></div>
                    <div className="ascii-highlight mb-4 text-xl text-red-400">+-- Link Error --+</div>
                    <div className="space-y-3">
                        <div className="text-red-400">
                            {linkError}
                        </div>
                        <div className="ascii-dim text-sm">
                            Password reset links expire quickly for security. Please request a new one.
                        </div>
                        <div className="pt-2 flex gap-2">
                            <Link to="/forgot-password" className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1">
                                Request New Link
                            </Link>
                            <Link to="/login" className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1">
                                Go to Login
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show error if not authenticated and not a recovery session
    console.log('Auth check:', {
        hasUser: !!user,
        isRecoverySession,
        loading,
        checkingSession
    });

    if (!user && !isRecoverySession) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
                    <div className="mb-2"><BackButton /></div>
                    <div className="ascii-highlight mb-4 text-xl">+-- Authentication Required --+</div>
                    <div className="space-y-3">
                        <div className="text-red-400">
                            You must be logged in to change your password.
                        </div>
                        <div className="ascii-dim text-sm">
                            To reset your password:
                        </div>
                        <ol className="ascii-dim text-sm list-decimal list-inside space-y-1">
                            <li>Go to the login page</li>
                            <li>Click "Forgot Password?"</li>
                            <li>Enter your email</li>
                            <li>Check your inbox for the reset link</li>
                            <li>Click the link in the email</li>
                        </ol>
                        <div className="pt-2 flex gap-2">
                            <Link to="/login" className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1">
                                Go to Login
                            </Link>
                            <Link to="/forgot-password" className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1">
                                Forgot Password
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
                <div className="mb-2"><BackButton /></div>
                <div className="ascii-highlight mb-4 text-xl">+-- Set New Password --+</div>
                {user ? (
                    <div className="ascii-dim text-xs mb-3">Logged in as: {user.email}</div>
                ) : isRecoverySession ? (
                    <div className="ascii-dim text-xs mb-3">Password recovery session active</div>
                ) : null}
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
                            disabled={submitting}
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
                            disabled={submitting}
                            minLength={6}
                        />
                    </label>
                    <button
                        className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50 w-full"
                        type="submit"
                        disabled={submitting}
                    >
                        {submitting ? "Updating..." : "Update Password"}
                    </button>
                </form>
            </div>
        </div>
    );
}
