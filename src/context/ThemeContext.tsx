import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "green" | "amber" | "cyan" | "c64";

interface ThemeContextType {
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
