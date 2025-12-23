import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type User = {
  id: string;
  email: string;
  password: string; // unused with Supabase; retained for compatibility
  username: string;
  avatarDataUrl?: string;
  mfaEnabled: boolean;
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  register: (info: { email: string; password: string; username: string; avatarDataUrl?: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (changes: Partial<Pick<User, "username" | "avatarDataUrl">>) => void;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  mfa: {
    enroll: () => Promise<{ id: string; type: 'totp'; totp: { qr_code: string; secret: string; uri: string } }>;
    verify: (factorId: string, code: string) => Promise<void>;
    challenge: (factorId: string) => Promise<{ id: string;[key: string]: any }>;
    verifyChallenge: (factorId: string, challengeId: string, code: string) => Promise<void>;
    listFactors: () => Promise<any[]>;
  };
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
  // Map username from metadata, fallback to email prefix
  const username = (u.user_metadata?.username as string | undefined) || u.email?.split("@")[0] || "User";
  const avatarDataUrl = (u.user_metadata?.avatarDataUrl as string | undefined) || undefined;
  // Check if user has verified MFA factors
  const mfaEnabled = u.factors?.some(f => f.status === 'verified') ?? false;
  return {
    id: u.id,
    email: u.email || "",
    password: "", // not stored when using Supabase
    username,
    avatarDataUrl,
    mfaEnabled,
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
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // getUser() ensures we have the latest factors/metadata
            const { data: { user } } = await supabase.auth.getUser();
            setUser(mapSupabaseUser(user ?? session.user));
          }

          const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
              // Optionally refetch user to get factors if missing
              // const { data: { user } } = await supabase.auth.getUser();
              setUser(mapSupabaseUser(session.user));
            } else {
              setUser(null);
            }
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
            data: { username }, // Store username in metadata
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
        username,
        avatarDataUrl,
        mfaEnabled: false,
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

        const { data, error } = await supabase.auth.updateUser({
          data: {
            username: changes.username ?? current.username,
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
    mfa: {
      async enroll(friendlyName) {
        if (!supabase) throw new Error("MFA not supported in demo mode");
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName
        });
        if (error) throw error;
        return data;
      },
      async verify(factorId, code) {
        if (!supabase) throw new Error("MFA not supported in demo mode");
        const { data, error } = await supabase.auth.mfa.challenge({ factorId });
        if (error) throw error;
        const { error: verifyErr } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: data.id,
          code
        });
        if (verifyErr) throw verifyErr;
        // Refresh user session to update factor verification status
        await supabase.auth.refreshSession();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(mapSupabaseUser(currentUser));
      },
      async challenge(factorId) {
        if (!supabase) throw new Error("MFA not supported in demo mode");
        const { data, error } = await supabase.auth.mfa.challenge({ factorId });
        if (error) throw error;
        return data;
      },
      async verifyChallenge(factorId, challengeId, code) {
        if (!supabase) throw new Error("MFA not supported in demo mode");
        const { error } = await supabase.auth.mfa.verify({
          factorId,
          challengeId,
          code
        });
        if (error) throw error;
      },
      async listFactors() {
        if (!supabase) return [];
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        return data.all;
      },
      async unenroll(factorId) {
        if (!supabase) throw new Error("MFA not supported in demo mode");
        const { error } = await supabase.auth.mfa.unenroll({ factorId });
        if (error) throw error;
      }
    }
  }), [user, loading]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
