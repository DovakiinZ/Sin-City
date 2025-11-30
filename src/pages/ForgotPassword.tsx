import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
    const { resetPassword } = useAuth();
    const { toast } = useToast();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            await resetPassword(email);
            setEmailSent(true);
            toast({
                title: "Email Sent",
                description: "Check your inbox for password reset instructions.",
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to send reset email";
            toast({
                title: "Error",
                description: message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }

    if (emailSent) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="w-full max-w-md mx-auto font-mono border border-green-700 p-4 bg-black/70">
                    <div className="mb-2"><BackButton /></div>
                    <div className="ascii-highlight mb-4 text-xl">+-- Email Sent --+</div>
                    <div className="space-y-3">
                        <div className="ascii-text">
                            Password reset instructions have been sent to:
                        </div>
                        <div className="ascii-highlight">{email}</div>
                        <div className="ascii-dim text-sm">
                            Check your inbox and click the link to reset your password.
                        </div>
                        <div className="pt-2">
                            <Link to="/login" className="ascii-nav-link hover:ascii-highlight">
                                Back to Login
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
                <div className="ascii-highlight mb-4 text-xl">+-- Reset Password --+</div>
                <div className="ascii-dim text-sm mb-4">
                    Enter your email address and we'll send you a link to reset your password.
                </div>
                <form onSubmit={onSubmit} className="space-y-3">
                    <label className="block">
                        <div className="ascii-dim text-xs mb-1">Email</div>
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black text-green-400 border border-green-700 px-2 py-1 outline-none"
                            required
                            type="email"
                            disabled={loading}
                        />
                    </label>
                    <div className="flex items-center gap-2">
                        <button
                            className="ascii-nav-link hover:ascii-highlight border border-green-700 px-3 py-1 disabled:opacity-50"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? "Sending..." : "Send Reset Link"}
                        </button>
                        <span className="ascii-dim text-xs">or</span>
                        <Link to="/login" className="ascii-nav-link hover:ascii-highlight">
                            Back to Login
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
