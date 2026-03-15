import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface DMNotificationSettings {
    email_enabled: boolean;
    delay_minutes: number;
}

export default function NotificationSettings() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<DMNotificationSettings>({
        email_enabled: true,
        delay_minutes: 5
    });

    // Fetch current settings
    useEffect(() => {
        if (!user) return;

        const fetchSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('dm_notification_settings')
                    .select('email_enabled, delay_minutes')
                    .eq('user_id', user.id)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error('Error fetching notification settings:', error);
                    return;
                }

                if (data) {
                    setSettings(data);
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('dm_notification_settings')
                .upsert({
                    user_id: user.id,
                    email_enabled: settings.email_enabled,
                    delay_minutes: settings.delay_minutes,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error saving settings:', error);
                alert('Failed to save settings');
            } else {
                alert('Settings saved successfully!');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 bg-black/50 border border-green-800/40 rounded-lg">
                <div className="flex items-center gap-2 text-green-400">
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    <span>Loading settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-black/50 border border-green-800/40 rounded-lg space-y-6">
            <div>
                <h3 className="text-xl font-bold text-green-400 mb-2 font-mono">
                    DM Email Notifications
                </h3>
                <p className="text-sm text-gray-400 font-mono">
                    Get notified by email when you receive new messages while offline
                </p>
            </div>

            <div className="space-y-4">
                {/* Email notifications toggle */}
                <div className="flex items-center justify-between p-4 bg-black/30 border border-green-900/30 rounded">
                    <div>
                        <label className="text-green-400 font-mono font-medium">
                            Email Notifications
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                            Receive email alerts for unread messages
                        </p>
                    </div>
                    <button
                        onClick={() => setSettings(prev => ({ ...prev, email_en abled: !prev.email_enabled }))}
                        className={`
              relative w-14 h-7 rounded-full transition-colors
              ${settings.email_enabled ? 'bg-green-600' : 'bg-gray-600'}
            `}
                    >
                        <div
                            className={`
                absolute top-1 w-5 h-5 bg-white rounded-full transition-transform
                ${settings.email_enabled ? 'translate-x-8' : 'translate-x-1'}
              `}
                        />
                    </button>
                </div>

                {/* Delay selector */}
                <div className="p-4 bg-black/30 border border-green-900/30 rounded">
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
                                onClick={() => setSettings(prev => ({ ...prev, delay_minutes: minutes }))}
                                disabled={!settings.email_enabled}
                                className={`
                  px-4 py-2 rounded font-mono text-sm transition-colors
                  ${settings.delay_minutes === minutes
                                        ? 'bg-green-600 text-black font-bold'
                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    }
                  ${!settings.email_enabled && 'opacity-50 cursor-not-allowed'}
                `}
                            >
                                {minutes}m
                            </button>
                        ))}
                    </div>
                </div>

                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="
            w-full py-3 px-6 bg-green-600 hover:bg-green-500 text-black 
            font-mono font-bold rounded transition-colors disabled:opacity-50
            disabled:cursor-not-allowed
          "
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            <div className="text-xs text-gray-500 font-mono space-y-1 pt-4 border-t border-green-900/30">
                <p>• Emails are only sent when you're offline</p>
                <p>• Opening the conversation cancels pending emails</p>
                <p>• Max one email per conversation per unread period</p>
            </div>
        </div>
    );
}
