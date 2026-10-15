"use client";

import React, { useState } from "react";
import { X, LogIn, UserPlus, LogOut, AlertCircle, CheckCircle2, Loader2, Cloud, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { user, signInWithEmail, signUpWithEmail, signInAnonymously, signOut } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setEmail("");
    setPassword("");
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) throw error;
        setSuccessMessage("Signed in successfully.");
        setTimeout(() => {
          handleReset();
          onClose();
        }, 800);
      } else {
        const { user: newUser, session, error } = await signUpWithEmail(email.trim(), password);
        if (error) throw error;

        if (newUser && !session) {
          setSuccessMessage(
            "Account created! Please check your email to confirm your account before signing in."
          );
        } else {
          setSuccessMessage("Account created and signed in!");
          setTimeout(() => {
            handleReset();
            onClose();
          }, 1000);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const { error } = await signInAnonymously();
      if (error) {
        if (error.message.includes("Anonymous sign-ins are disabled")) {
          throw new Error(
            "Anonymous sign-in is disabled in your Supabase dashboard. Enable it under Authentication > Providers > Anonymous Sign-ins, or sign up with email."
          );
        }
        throw error;
      }
      setSuccessMessage("Signed in as guest!");
      setTimeout(() => {
        handleReset();
        onClose();
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in anonymously.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      setSuccessMessage("Signed out.");
      setTimeout(() => {
        handleReset();
        onClose();
      }, 600);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to sign out.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-emerald-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Supabase Cloud Sync
            </h2>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {!isSupabaseConfigured && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
              Supabase environment variables are missing. Running in local-storage mode.
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {user ? (
            /* Signed In State */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authenticated via Supabase</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Signed in as:
                </p>
                <p className="text-sm font-mono font-medium text-zinc-900 dark:text-zinc-100 break-all">
                  {user.email || "Anonymous User (" + user.id.slice(0, 8) + "...)"}
                </p>
                <p className="text-[11px] text-zinc-400 pt-1">
                  Your songs, playlists, and track order are securely synchronized to your private cloud library using Row Level Security.
                </p>
              </div>

              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/20 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            /* Sign In / Sign Up Form */
            <div className="space-y-4">
              {/* Tab Switcher */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setErrorMessage(null);
                  }}
                  className={`flex-1 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                    mode === "signin"
                      ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                      : "border-transparent text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setErrorMessage(null);
                  }}
                  className={`flex-1 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                    mode === "signup"
                      ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                      : "border-transparent text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 rounded-xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 mt-2 flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === "signin" ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create Account
                    </>
                  )}
                </button>
              </form>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-semibold text-zinc-400 bg-white dark:bg-zinc-900 px-2">
                  Or
                </div>
              </div>

              <button
                type="button"
                onClick={handleAnonymousSignIn}
                disabled={isLoading}
                className="w-full h-9 flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                Sign In as Anonymous Guest
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
