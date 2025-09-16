import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type User = {
  id: string;
  email: string;
  password: string; // stored in localStorage for demo only
  displayName: string;
  avatarDataUrl?: string;
};

type AuthContextType = {
  user: User | null;
  register: (info: { email: string; password: string; displayName: string; avatarDataUrl?: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (changes: Partial<Pick<User, "displayName" | "avatarDataUrl">>) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USERS_KEY = "auth.users";
const CURRENT_KEY = "auth.currentUserId";

function loadUsers(): User[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as User[];
  } catch {
    return [];
  }
}

function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const id = localStorage.getItem(CURRENT_KEY);
    if (!id) return;
    const users = loadUsers();
    const u = users.find((x) => x.id === id) || null;
    setUser(u);
  }, []);

  const api = useMemo<AuthContextType>(() => ({
    user,
    async register({ email, password, displayName, avatarDataUrl }) {
      const users = loadUsers();
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("Email already registered");
      }
      const newUser: User = {
        id: crypto.randomUUID(),
        email,
        password,
        displayName,
        avatarDataUrl,
      };
      users.push(newUser);
      saveUsers(users);
      localStorage.setItem(CURRENT_KEY, newUser.id);
      setUser(newUser);
    },
    async login(email, password) {
      const users = loadUsers();
      const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (!found) throw new Error("Invalid credentials");
      localStorage.setItem(CURRENT_KEY, found.id);
      setUser(found);
    },
    logout() {
      localStorage.removeItem(CURRENT_KEY);
      setUser(null);
    },
    updateProfile(changes) {
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...changes } as User;
        const users = loadUsers();
        const idx = users.findIndex((u) => u.id === updated.id);
        if (idx >= 0) {
          users[idx] = updated;
          saveUsers(users);
        }
        localStorage.setItem(CURRENT_KEY, updated.id);
        return updated;
      });
    },
  }), [user]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

