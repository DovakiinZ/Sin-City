import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type User = {
  id: string;
  email: string;
  password: string; // unused with Supabase; retained for compatibility
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

function mapSupabaseUser(u: SupabaseAuthUser | null): User | null {
  if (!u) return null;
  const displayName = (u.user_metadata?.displayName as string | undefined) || u.email?.split("@")[0] || "User";
  const avatarDataUrl = (u.user_metadata?.avatarDataUrl as string | undefined) || undefined;
  return {
    id: u.id,
    email: u.email || "",
    password: "", // not stored when using Supabase
    displayName,
    avatarDataUrl,
  } satisfies User;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Initialize from Supabase session if available; otherwise fallback to local demo auth
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUser = mapSupabaseUser(sessionData.session?.user ?? null);
        setUser(currentUser);
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(mapSupabaseUser(session?.user ?? null));
        });
        unsub = () => listener.subscription.unsubscribe();
      } else {
        const id = localStorage.getItem(CURRENT_KEY);
        if (id) {
          const users = loadUsers();
          const u = users.find((x) => x.id === id) || null;
          setUser(u);
        }
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const api = useMemo<AuthContextType>(() => ({
    user,
    async register({ email, password, displayName, avatarDataUrl }) {
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { displayName, avatarDataUrl } },
        });
        if (error) throw error;
        if (data.session && data.user) {
          const mapped = mapSupabaseUser(data.user);
          if (!mapped) throw new Error("Sign up succeeded but user data is missing.");
          setUser(mapped);
        } else {
          throw new Error("Sign up successful. Please check your email to confirm.");
        }
        return;
      }

      // Fallback: local demo auth
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
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const mapped = mapSupabaseUser(data.user);
        if (!mapped) throw new Error("Login succeeded but user data is missing.");
        setUser(mapped);
        return;
      }
      const users = loadUsers();
      const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (!found) throw new Error("Invalid credentials");
      localStorage.setItem(CURRENT_KEY, found.id);
      setUser(found);
    },
    async logout() {
      if (supabase) {
        await supabase.auth.signOut();
        setUser(null);
        return;
      }
      localStorage.removeItem(CURRENT_KEY);
      setUser(null);
    },
    async updateProfile(changes) {
      if (supabase) {
        const current = user;
        if (!current) return;
        const { data, error } = await supabase.auth.updateUser({
          data: {
            displayName: changes.displayName ?? current.displayName,
            avatarDataUrl: changes.avatarDataUrl ?? current.avatarDataUrl,
          },
        });
        if (error) throw error;
        const mapped = mapSupabaseUser(data.user);
        if (!mapped) return;
        setUser(mapped);
        return;
      }
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
