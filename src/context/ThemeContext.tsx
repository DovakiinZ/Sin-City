import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "green" | "amber" | "cyan" | "c64";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}

export function ThemeProvider({
    children,
    defaultTheme = "green",
    storageKey = "ascii-theme"
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem(storageKey);
        return (saved as Theme) || defaultTheme;
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove("theme-green", "theme-amber", "theme-cyan", "theme-c64");
        root.classList.add(`theme-${theme}`);
        localStorage.setItem(storageKey, theme);
    }, [theme, storageKey]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
