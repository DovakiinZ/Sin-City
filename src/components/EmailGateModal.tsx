import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Mail, AlertTriangle, Shield, CheckCircle, Loader2 } from "lucide-react";

interface EmailGateModalProps {
    guestId: string | null;
    onVerified: (email: string) => void;
    onCancel: () => void;
    postCount: number;
}

type Step = 'email' | 'otp' | 'success';

export default function EmailGateModal({ guestId, onVerified, onCancel, postCount }: EmailGateModalProps) {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [countdown, setCountdown] = useState(0);

    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Countdown timer for resend
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    // Focus first OTP input when step changes
    useEffect(() => {
        if (step === 'otp' && otpRefs.current[0]) {
            otpRefs.current[0].focus();
        }
    }, [step]);

    // Email validation
    const isValidEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Handle email submission
    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.trim()) {
            setError("Email is required");
            return;
        }

        if (!isValidEmail(email)) {
            setError("Please enter a valid email address");
            return;
        }

        if (!guestId) {
            setError("Session error. Please refresh the page.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/send-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guest_id: guestId,
                    email: email.trim().toLowerCase(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send verification code');
            }

            setStep('otp');
            setCountdown(120); // 2 minute cooldown for resend
        } catch (err: any) {
            setError(err.message || "Failed to send verification email");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle OTP input
    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only digits

        const newOtp = [...otp];
        newOtp[index] = value.slice(-1); // Only last digit
        setOtp(newOtp);
        setError(null);

        // Auto-focus next input
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all digits entered
        if (newOtp.every(d => d) && newOtp.join('').length === 6) {
            verifyOtp(newOtp.join(''));
        }
    };

    // Handle backspace navigation
    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    // Handle paste
    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            const newOtp = pasted.split('');
            setOtp(newOtp);
            verifyOtp(pasted);
        }
    };

    // Verify OTP
    const verifyOtp = async (code: string) => {
        if (!guestId) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guest_id: guestId,
                    code: code,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Invalid verification code');
            }

            setStep('success');

            // Wait a moment then complete
            setTimeout(() => {
                onVerified(email.trim().toLowerCase());
            }, 1500);

        } catch (err: any) {
            setError(err.message || "Verification failed");
            setOtp(["", "", "", "", "", ""]);
            otpRefs.current[0]?.focus();
        } finally {
            setIsSubmitting(false);
        }
    };

    // Resend code
    const handleResend = async () => {
        if (countdown > 0) return;
        setOtp(["", "", "", "", "", ""]);
        setError(null);
        await handleEmailSubmit({ preventDefault: () => { } } as React.FormEvent);
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="ascii-box bg-background max-w-md w-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-ascii-border">
                    <div className="flex items-center gap-2">
                        {step === 'success' ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <Mail className="w-5 h-5 ascii-highlight" />
                        )}
                        <span className="ascii-highlight text-lg">
                            {step === 'email' && 'Verify Your Identity'}
                            {step === 'otp' && 'Enter Verification Code'}
                            {step === 'success' && 'Verified!'}
                        </span>
                    </div>
                    {step !== 'success' && (
                        <button
                            onClick={onCancel}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Step: Email Input */}
                    {step === 'email' && (
                        <>
                            <div className="ascii-box p-4 bg-yellow-500/5 border-yellow-500/30">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                                    <div className="text-sm">
                                        <p className="text-yellow-400 font-medium mb-1">
                                            You've posted {postCount} times as a guest
                                        </p>
                                        <p className="ascii-dim">
                                            To continue posting, verify your email with a one-time code.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs ascii-dim">
                                <Shield className="w-4 h-4" />
                                <span>Your email is private and never shown publicly</span>
                            </div>

                            <form onSubmit={handleEmailSubmit} className="space-y-4">
                                <div>
                                    <label className="block ascii-dim text-xs mb-2">EMAIL ADDRESS</label>
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setError(null);
                                        }}
                                        placeholder="your@email.com"
                                        className="ascii-box bg-transparent border-ascii-border focus-visible:ring-ascii-highlight"
                                        autoFocus
                                        disabled={isSubmitting}
                                    />
                                    {error && (
                                        <p className="text-red-400 text-xs mt-2">{error}</p>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={onCancel}
                                        className="flex-1 ascii-box"
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || !email.trim()}
                                        className="flex-1 ascii-box bg-ascii-highlight text-black hover:bg-ascii-highlight/90"
                                    >
                                        {isSubmitting ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                                        ) : (
                                            'Send Code'
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}

                    {/* Step: OTP Input */}
                    {step === 'otp' && (
                        <>
                            <div className="text-center">
                                <p className="ascii-dim text-sm mb-1">
                                    We sent a 6-digit code to
                                </p>
                                <p className="text-green-400 font-medium">{email}</p>
                            </div>

                            <div className="flex justify-center gap-2">
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={(el) => (otpRefs.current[index] = el)}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleOtpChange(index, e.target.value)}
                                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                        onPaste={handleOtpPaste}
                                        disabled={isSubmitting}
                                        className="w-12 h-14 text-center text-2xl font-mono ascii-box bg-transparent border-ascii-border focus:border-green-500 focus:outline-none disabled:opacity-50"
                                    />
                                ))}
                            </div>

                            {error && (
                                <p className="text-red-400 text-xs text-center">{error}</p>
                            )}

                            {isSubmitting && (
                                <div className="flex justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                                </div>
                            )}

                            <div className="text-center text-sm">
                                <button
                                    onClick={handleResend}
                                    disabled={countdown > 0 || isSubmitting}
                                    className={countdown > 0 ? "ascii-dim" : "text-green-400 hover:text-green-300"}
                                >
                                    {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
                                </button>
                            </div>

                            <Button
                                variant="outline"
                                onClick={() => setStep('email')}
                                className="w-full ascii-box"
                                disabled={isSubmitting}
                            >
                                Use different email
                            </Button>
                        </>
                    )}

                    {/* Step: Success */}
                    {step === 'success' && (
                        <div className="text-center py-8">
                            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h3 className="text-xl font-medium text-green-400 mb-2">
                                Email Verified!
                            </h3>
                            <p className="ascii-dim text-sm">
                                You can now continue posting.
                            </p>
                        </div>
                    )}

                    {/* ASCII decoration */}
                    {step !== 'success' && (
                        <div className="text-center text-xs ascii-dim font-mono opacity-50 pt-4 border-t border-ascii-border">
                            <pre>{`
    ╔═══════════════════╗
    ║   S I N   C I T Y ║
    ║   guest verified  ║
    ╚═══════════════════╝
                            `}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
