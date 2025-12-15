import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type User = {
  id: string;
  email: string;
  password: string; // unused with Supabase; retained for compatibility
  displayName: string; // Keeping this for backward compatibility, but it will map to username if display_name is null
  username?: string;
  avatarDataUrl?: string;
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  register: (info: { email: string; password: string; username: string; avatarDataUrl?: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (changes: Partial<Pick<User, "displayName" | "avatarDataUrl">>) => void;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

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
  const displayName = (u.user_metadata?.username as string | undefined) || (u.user_metadata?.displayName as string | undefined) || u.email?.split("@")[0] || "User";
  const username = (u.user_metadata?.username as string | undefined) || displayName;
  const avatarDataUrl = (u.user_metadata?.avatarDataUrl as string | undefined) || undefined;
  return {
    id: u.id,
    email: u.email || "",
    password: "", // not stored when using Supabase
    displayName,
    username,
    avatarDataUrl,
  } satisfies User;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize from Supabase session if available; otherwise fallback to local demo auth
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const currentUser = mapSupabaseUser(sessionData.session?.user ?? null);
          setUser(currentUser);
          const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(mapSupabaseUser(session?.user ?? null));
            setLoading(false);
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
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const api = useMemo<AuthContextType>(() => ({
    user,
    loading,
    async register({ email, password, username, avatarDataUrl }) {
      if (supabase) {
        // Note: avatarDataUrl should be stored in profiles table, NOT in user_metadata
        // Storing large base64 images in metadata causes 431 (Request Header Too Large) errors
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username, displayName: username }, // Store username as both for compatibility
            emailRedirectTo: window.location.origin
          },
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
        displayName: username,
        username,
        avatarDataUrl,
      };
      users.push(newUser);
      saveUsers(users);
      localStorage.setItem(CURRENT_KEY, newUser.id);
      setUser(newUser);
    },
    async login(emailOrUsername, password) {
      if (supabase) {
        let email = emailOrUsername;

        // Check if input is a username (doesn't contain @)
        if (!emailOrUsername.includes('@')) {
          // Use RPC function to get email from username
          const { data: userEmail, error: rpcError } = await supabase
            .rpc('get_email_from_username', { input_username: emailOrUsername });

          if (rpcError || !userEmail) {
            throw new Error("Invalid credentials");
          }

          email = userEmail;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const mapped = mapSupabaseUser(data.user);
        if (!mapped) throw new Error("Login succeeded but user data is missing.");
        setUser(mapped);
        return;
      }
      const users = loadUsers();
      const found = users.find((u) => u.email.toLowerCase() === emailOrUsername.toLowerCase() && u.password === password);
      if (!found) throw new Error("Invalid credentials");
      localStorage.setItem(CURRENT_KEY, found.id);
      setUser(found);
    },
    async logout() {
      if (supabase) {
        // Sign out with 'local' scope to clear the session from this device
        await supabase.auth.signOut({ scope: 'local' });
        // Immediately set user to null to update UI
        setUser(null);

        // Clear all Supabase session keys from localStorage
        // Supabase stores session data with keys like 'sb-<project-ref>-auth-token'
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Clear auth-related localStorage keys
        localStorage.removeItem(USERS_KEY);
        localStorage.removeItem(CURRENT_KEY);
        return;
      }
      localStorage.removeItem(CURRENT_KEY);
      setUser(null);
    },
    async updateProfile(changes) {
      if (supabase) {
        const current = user;
        if (!current) return;
        // Only store displayName in metadata, not avatarDataUrl (too large for JWT)
        const { data, error } = await supabase.auth.updateUser({
          data: {
            displayName: changes.displayName ?? current.displayName,
            // avatarDataUrl should be stored in profiles table, not here
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
    async resetPassword(email) {
      if (supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        return;
      }
      // Fallback: local demo auth (just simulate success)
      console.log("Password reset email would be sent to:", email);
    },
    async updatePassword(newPassword) {
      if (supabase) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) throw error;
        return;
      }
      // Fallback: local demo auth
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, password: newPassword } as User;
        const users = loadUsers();
        const idx = users.findIndex((u) => u.id === updated.id);
        if (idx >= 0) {
          users[idx] = updated;
          saveUsers(users);
        }
        return updated;
      });
    },
  }), [user, loading]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
