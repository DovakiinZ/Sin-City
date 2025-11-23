import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "green" | "amber" | "cyan" | "c64";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem("ascii-theme");
        return (saved as Theme) || "green";
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove("theme-green", "theme-amber", "theme-cyan", "theme-c64");
        root.classList.add(`theme-${theme}`);
        localStorage.setItem("ascii-theme", theme);
    }, [theme]);

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
