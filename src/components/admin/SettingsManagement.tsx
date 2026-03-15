import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertCircle } from "lucide-react";

interface SiteSetting {
    id: string;
    value: any;
    description: string;
}

export default function SettingsManagement() {
    const [settings, setSettings] = useState<SiteSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("site_settings")
                .select("*")
                .order("id");

            if (error) throw error;
            setSettings(data || []);
        } catch (error) {
            console.error("Error fetching settings:", error);
            toast({
                title: "Error",
                description: "Failed to load site settings",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (id: string, currentValue: boolean) => {
        setSettings(prev => prev.map(s =>
            s.id === id ? { ...s, value: !currentValue } : s
        ));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            for (const setting of settings) {
                const { error } = await supabase
                    .from("site_settings")
                    .update({ value: setting.value, updated_at: new Date().toISOString() })
                    .eq("id", setting.id);

                if (error) throw error;
            }

            toast({
                title: "Success",
                description: "Settings saved successfully",
            });
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({
                title: "Error",
                description: "Failed to save settings",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    const handleInitialize = async () => {
        setSaving(true);
        try {
            const initialSettings = [
                {
                    id: 'allow_anonymous_posts',
                    value: true,
                    description: 'Toggle whether guests can create posts'
                }
            ];

            const { error } = await supabase
                .from("site_settings")
                .upsert(initialSettings);

            if (error) throw error;

            toast({
                title: "System Initialized",
                description: "Default settings have been created",
            });
            fetchSettings();
        } catch (error) {
            console.error("Error initializing settings:", error);
            toast({
                title: "Initialization Failed",
                description: "Check if the 'site_settings' table exists in your database.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-12 flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                <p className="ascii-dim text-sm">Accessing system configuration...</p>
            </div>
        );
    }

    const allowAnonPosts = settings.find(s => s.id === 'allow_anonymous_posts');

    return (
        <div className="space-y-6">
            <div className="ascii-box p-6 bg-black/40">
                <div className="flex items-center justify-between mb-6 border-b border-green-900/30 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-green-400 font-mono">SITE CONFIGURATION</h2>
                        <p className="text-xs ascii-dim mt-1">Modify core platform behavior</p>
                    </div>
                    {settings.length > 0 && (
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-green-600 hover:bg-green-500 text-black font-bold px-6"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            SAVE CHANGES
                        </Button>
                    )}
                </div>

                <div className="space-y-4">
                    {allowAnonPosts ? (
                        <div className="flex items-center justify-between p-4 bg-black/20 border border-green-900/20 rounded-lg group hover:border-green-500/30 transition-all">
                            <div className="max-w-[70%]">
                                <label className="text-green-400 font-mono font-medium block mb-1">
                                    Anonymous Posting
                                </label>
                                <p className="text-xs text-gray-500">
                                    {allowAnonPosts.description}
                                </p>
                            </div>
                            <button
                                onClick={() => handleToggle('allow_anonymous_posts', allowAnonPosts.value as boolean)}
                                className={`
                                    relative w-14 h-7 rounded-full transition-all duration-300
                                    ${allowAnonPosts.value ? 'bg-green-600 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-gray-800'}
                                `}
                            >
                                <div
                                    className={`
                                        absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-300 transform
                                        ${allowAnonPosts.value ? 'translate-x-8' : 'translate-x-1'}
                                    `}
                                />
                            </button>
                        </div>
                    ) : (
                        <div className="p-8 border border-yellow-900/30 bg-yellow-900/5 rounded-lg text-center space-y-4">
                            <div className="flex justify-center">
                                <AlertCircle className="w-10 h-10 text-yellow-500 opacity-50" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-yellow-500 font-mono">SYSTEM NOT INITIALIZED</p>
                                <p className="text-xs text-yellow-700 max-w-sm mx-auto">
                                    The site settings table has not been seeded with default values.
                                </p>
                            </div>
                            <Button
                                onClick={handleInitialize}
                                disabled={saving}
                                className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "INITIALIZE DEFAULT SETTINGS"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="ascii-box p-4 bg-yellow-900/5 border-yellow-900/20">
                <p className="text-xs text-yellow-600 font-mono">
                    <span className="font-bold mr-2">NOTICE:</span>
                    Changes to site settings are logged and apply instantly across the platform. Disabling anonymous posting will prevent guest users from creating new entries but will not hide existing ones.
                </p>
            </div>
        </div>
    );
}
