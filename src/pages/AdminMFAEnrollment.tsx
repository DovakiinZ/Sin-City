import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function AdminMFAEnrollment() {
    const { user, mfa } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [factorId, setFactorId] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect if not admin or already enabled
    useEffect(() => {
        if (!user) {
            navigate("/login");
            return;
        }
        // Ideally we check admin role here too, but ProtectedRoute will handle that.
        // If already enabled, go to admin dashboard
        if (user.mfaEnabled) {
            navigate("/crowd");
        }
    }, [user, navigate]);

    // Start enrollment on mount
    useEffect(() => {
        if (user && !user.mfaEnabled && !qrCode) {
            startEnrollment();
        }
    }, [user]);

    async function startEnrollment() {
        try {
            const data = await mfa.enroll('Sin City Admin');
            setFactorId(data.id);
            setQrCode(data.totp.uri);
        } catch (err: any) {
            console.error("Enrollment error:", err);
            // If factor already exists, try to clean up unverified ones
            if (err.message?.includes("already exists") || err.message?.includes("friendly name")) {
                try {
                    const factors = await mfa.listFactors();
                    const staleFactors = factors.filter((f: any) =>
                        f.factor_type === 'totp' && f.status === 'unverified'
                    );

                    if (staleFactors.length > 0) {
                        await Promise.all(staleFactors.map((f: any) => mfa.unenroll(f.id)));
                        // Retry enrollment
                        const retryData = await mfa.enroll('Sin City Admin');
                        setFactorId(retryData.id);
                        setQrCode(retryData.totp.uri);
                        return;
                    }
                } catch (cleanupErr) {
                    console.error("Cleanup failed:", cleanupErr);
                }
            }

            setError(err.message);
            toast({ title: "Error", description: "Failed to start enrollment. " + err.message, variant: "destructive" });
        }
    }

    async function handleVerify() {
        if (!code || !factorId) return;
        setLoading(true);
        setError(null);
        try {
            await mfa.verify(factorId, code);
            toast({ title: "Success", description: "2FA Enabled Successfully" });
            navigate("/crowd");
        } catch (err: any) {
            setError(err.message);
            toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="w-full max-w-md border border-green-700 bg-black/80 p-6 space-y-6">
                <h1 className="text-xl text-green-500 font-mono border-b border-green-700 pb-2">
                    Admin Security Setup
                </h1>

                <div className="space-y-4">
                    <p className="text-gray-400 text-sm">
                        To access the Admin Dashboard, you must enable Two-Factor Authentication (2FA).
                    </p>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 text-red-400 text-xs rounded">
                            {error}
                        </div>
                    )}

                    {qrCode ? (
                        <div className="flex flex-col items-center gap-4 bg-white/5 p-4 rounded-lg">
                            <div className="bg-white p-2 rounded">
                                <QRCodeSVG value={qrCode} size={192} />
                            </div>
                            <p className="text-xs text-gray-400 text-center">
                                Scan this QR code with your authenticator app (e.g., Google Authenticator, Authy).
                            </p>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2" />
                            <p className="text-xs text-gray-500">Generating security key...</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs text-green-400">Verification Code</label>
                        <input
                            type="text"
                            className="w-full bg-black border border-green-700 text-green-400 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-green-500"
                            placeholder="000 000"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                    </div>

                    <Button
                        onClick={handleVerify}
                        disabled={loading || code.length !== 6}
                        className="w-full bg-green-700 hover:bg-green-600 text-black font-bold"
                    >
                        {loading ? "Verifying..." : "Enable 2FA"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
