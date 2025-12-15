import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { useDeviceDetect } from "@/hooks/useDeviceDetect";

interface MobileMenuProps {
    className?: string;
}

const MobileMenu = ({ className }: MobileMenuProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { isMobile, isIOS, isAndroid } = useDeviceDetect();

    // Only show on actual mobile devices (phones), not just small desktop windows
    const isPhoneDevice = isMobile || isIOS || isAndroid;

    useEffect(() => {
        checkAdminStatus();
    }, [user]);

    const checkAdminStatus = async () => {
        if (!user) {
            setIsAdmin(false);
            return;
        }
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            if (!error && data?.role === 'admin') {
                setIsAdmin(true);
            }
        } catch {
            setIsAdmin(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
            setIsOpen(false);
            navigate("/");
        } catch (error) {
            console.error("Logout error:", error);
        }
    };

    const handleLinkClick = () => {
        setIsOpen(false);
    };

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Only render on actual phone devices
    if (!isPhoneDevice) {
        return null;
    }

    return (
        <div className={`lg:hidden ${className || ''}`}>
            {/* Hamburger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="ascii-box px-3 py-2 hover:bg-green-600/20 transition-colors"
                aria-label="Open menu"
            >
                <pre className="ascii-text text-xs leading-none">
                    {`[≡]`}
                </pre>
            </button>

            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Slide-out Menu */}
            <div
                className={`fixed top-0 left-0 h-full w-72 bg-background z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* ASCII Border Top */}
                <pre className="ascii-highlight text-xs px-2 pt-2">
                    {`╔══════════════════════════════╗`}
                </pre>

                {/* Header */}
                <div className="flex justify-between items-center px-4 py-2">
                    <pre className="ascii-highlight text-sm">║ NAVIGATION</pre>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="ascii-text hover:ascii-highlight"
                    >
                        [X]
                    </button>
                </div>

                <pre className="ascii-highlight text-xs px-2">
                    {`╠══════════════════════════════╣`}
                </pre>

                {/* Navigation Links */}
                <nav className="px-4 py-4 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
                    <Link
                        to="/"
                        onClick={handleLinkClick}
                        className="block ascii-nav-link hover:ascii-highlight py-1"
                    >
                        ║ → Home
                    </Link>
                    <Link
                        to="/create"
                        onClick={handleLinkClick}
                        className="block ascii-nav-link hover:ascii-highlight py-1"
                    >
                        ║ → Create Post
                    </Link>
                    <Link
                        to="/posts"
                        onClick={handleLinkClick}
                        className="block ascii-nav-link hover:ascii-highlight py-1"
                    >
                        ║ → Posts
                    </Link>
                    {isAdmin && (
                        <Link
                            to="/crowd"
                            onClick={handleLinkClick}
                            className="block ascii-nav-link hover:ascii-highlight text-yellow-500 py-1"
                        >
                            ║ → Admin Console
                        </Link>
                    )}
                    <Link
                        to="/about"
                        onClick={handleLinkClick}
                        className="block ascii-nav-link hover:ascii-highlight py-1"
                    >
                        ║ → About
                    </Link>
                    <Link
                        to="/contact"
                        onClick={handleLinkClick}
                        className="block ascii-nav-link hover:ascii-highlight py-1"
                    >
                        ║ → Contact
                    </Link>

                    {/* Separator */}
                    <pre className="ascii-dim text-xs">
                        {`╟──────────────────────────────╢`}
                    </pre>

                    {user ? (
                        <>
                            <Link
                                to="/profile"
                                onClick={handleLinkClick}
                                className="block ascii-nav-link hover:ascii-highlight py-1"
                            >
                                ║ → Profile
                            </Link>
                            <Link
                                to="/bookmarks"
                                onClick={handleLinkClick}
                                className="block ascii-nav-link hover:ascii-highlight py-1"
                            >
                                ║ → Bookmarks
                            </Link>
                            <Link
                                to="/drafts"
                                onClick={handleLinkClick}
                                className="block ascii-nav-link hover:ascii-highlight py-1"
                            >
                                ║ → Drafts
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="block w-full text-left ascii-nav-link hover:ascii-highlight text-red-400 py-1"
                            >
                                ║ → Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                to="/login"
                                onClick={handleLinkClick}
                                className="block ascii-nav-link hover:ascii-highlight py-1"
                            >
                                ║ → Login
                            </Link>
                            <Link
                                to="/register"
                                onClick={handleLinkClick}
                                className="block ascii-nav-link hover:ascii-highlight py-1"
                            >
                                ║ → Register
                            </Link>
                        </>
                    )}
                </nav>

                {/* Footer */}
                <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
                    <pre className="ascii-dim text-xs">
                        {`╟──────────────────────────────╢
║ Press 'Esc' to close         ║
╚══════════════════════════════╝`}
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default MobileMenu;
