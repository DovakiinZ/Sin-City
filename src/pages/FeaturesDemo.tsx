import { useState } from "react";
import { MessageCircle, Bell, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function FeaturesDemo() {
    const navigate = useNavigate();
    const [unreadCount, setUnreadCount] = useState(3);
    const [emailEnabled, setEmailEnabled] = useState(true);
    const [delayMinutes, setDelayMinutes] = useState(5);

    return (
        <div className="min-h-screen bg-black p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="text-center space-y-4 mb-12">
                    <h1 className="text-4xl font-bold text-green-400 font-mono">
                        New Features Demo
                    </h1>
                    <p className="text-gray-400 font-mono">
                        Preview of Chat Badge & Email Notifications
                    </p>
                    <button
                        onClick={() => navigate("/")}
                        className="text-green-500 hover:text-green-400 font-mono text-sm"
                    >
                        ← Back to Home
                    </button>
                </div>

                {/* Feature 1: Chat Icon Badge */}
                <div className="bg-black/50 border border-green-800/40 rounded-lg p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <Bell className="w-6 h-6 text-green-400" />
                        <h2 className="text-2xl font-bold text-green-400 font-mono">
                            Chat Icon Badge
                        </h2>
                    </div>

                    <div className="space-y-6">
                        <p className="text-gray-300 font-mono text-sm">
                            Real-time unread message counter on the chat icon. Backend-authoritative with multi-device sync.
                        </p>

                        {/* Demo Chat Icon */}
                        <div className="flex items-center justify-center p-12 bg-black/30 border border-green-900/30 rounded">
                            <div className="relative">
                                <button className="p-4 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded-lg transition-colors">
                                    <MessageCircle className="w-12 h-12" />
                                    {unreadCount > 0 && (
                                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                                            {unreadCount}
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-4">
                            <button
                                onClick={() => setUnreadCount(Math.max(0, unreadCount - 1))}
                                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-green-400 font-mono rounded transition-colors"
                            >
                                - Decrement
                            </button>
                            <span className="text-green-400 font-mono font-bold">
                                {unreadCount} unread
                            </span>
                            <button
                                onClick={() => setUnreadCount(unreadCount + 1)}
                                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-green-400 font-mono rounded transition-colors"
                            >
                                + Increment
                            </button>
                        </div>

                        {/* Features List */}
                        <div className="mt-6 p-4 bg-black/50 border border-green-900/30 rounded">
                            <h3 className="text-green-400 font-mono font-bold mb-3">Features:</h3>
                            <ul className="text-sm text-gray-400 font-mono space-y-2">
                                <li>✓ Real-time updates on new messages</li>
                                <li>✓ Auto-clears when conversation opened</li>
                                <li>✓ Multi-device synchronization</li>
                                <li>✓ No client-side manipulation</li>
                                <li>✓ Backend-authoritative counting</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Feature 2: DM Email Notifications */}
                <div className="bg-black/50 border border-green-800/40 rounded-lg p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <Mail className="w-6 h-6 text-green-400" />
                        <h2 className="text-2xl font-bold text-green-400 font-mono">
                            DM Email Notifications
                        </h2>
                    </div>

                    <div className="space-y-6">
                        <p className="text-gray-300 font-mono text-sm">
                            Twitter-like delayed email notifications for Direct Messages. Smart, non-annoying, privacy-safe.
                        </p>

                        {/* Email Toggle */}
                        <div className="p-6 bg-black/30 border border-green-900/30 rounded">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="text-green-400 font-mono font-medium">
                                        Email Notifications
                                    </label>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Receive email alerts for unread messages
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEmailEnabled(!emailEnabled)}
                                    className={`
                    relative w-14 h-7 rounded-full transition-colors
                    ${emailEnabled ? 'bg-green-600' : 'bg-gray-600'}
                  `}
                                >
                                    <div
                                        className={`
                      absolute top-1 w-5 h-5 bg-white rounded-full transition-transform
                      ${emailEnabled ? 'translate-x-8' : 'translate-x-1'}
                    `}
                                    />
                                </button>
                            </div>

                            {/* Delay Selector */}
                            <div className="mt-6">
                                <label className="block text-green-400 font-mono font-medium mb-3">
                                    Notification Delay
                                </label>
                                <p className="text-xs text-gray-500 mb-4">
                                    Wait time before sending email (prevents spam)
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                    {[5, 15, 30, 60].map((minutes) => (
                                        <button
                                            key={minutes}
                                            onClick={() => setDelayMinutes(minutes)}
                                            disabled={!emailEnabled}
                                            className={`
                        px-4 py-2 rounded font-mono text-sm transition-colors
                        ${delayMinutes === minutes
                                                    ? 'bg-green-600 text-black font-bold'
                                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                }
                        ${!emailEnabled && 'opacity-50 cursor-not-allowed'}
                      `}
                                        >
                                            {minutes}m
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Current Settings Display */}
                            <div className="mt-6 p-4 bg-black border border-green-900/50 rounded">
                                <div className="text-green-400 font-mono text-sm space-y-2">
                                    <div className="flex justify-between">
                                        <span>Status:</span>
                                        <span className={emailEnabled ? 'text-green-400' : 'text-red-400'}>
                                            {emailEnabled ? 'ENABLED' : 'DISABLED'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Delay:</span>
                                        <span>{delayMinutes} minutes</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Features List */}
                        <div className="p-4 bg-black/50 border border-green-900/30 rounded">
                            <h3 className="text-green-400 font-mono font-bold mb-3">Features:</h3>
                            <ul className="text-sm text-gray-400 font-mono space-y-2">
                                <li>✓ Only sends to offline users</li>
                                <li>✓ Configurable delay (5-60 minutes)</li>
                                <li>✓ Auto-cancels if user reads message</li>
                                <li>✓ Max one email per conversation</li>
                                <li>✓ Privacy-safe (no message content)</li>
                                <li>✓ Background cron job processing</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Implementation Status */}
                <div className="bg-green-900/20 border border-green-600/40 rounded-lg p-6">
                    <h3 className="text-green-400 font-mono font-bold mb-4">
                        📋 Implementation Status
                    </h3>
                    <div className="space-y-3 text-sm font-mono">
                        <div className="flex items-center gap-3">
                            <span className="text-green-400">✓</span>
                            <span className="text-gray-300">Frontend components created</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-green-400">✓</span>
                            <span className="text-gray-300">Database schema designed</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-green-400">✓</span>
                            <span className="text-gray-300">API endpoints implemented</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-yellow-400">⚠</span>
                            <span className="text-gray-300">Database migrations pending</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-yellow-400">⚠</span>
                            <span className="text-gray-300">Edge Function deployment pending</span>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-black/50 rounded border border-green-900/30">
                        <p className="text-xs text-gray-400 font-mono">
                            <strong className="text-green-400">Next Step:</strong> Run the SQL migrations in Supabase to activate these features in production.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
