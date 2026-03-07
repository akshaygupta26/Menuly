"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthMode = "login" | "signup" | "magic-link" | "forgot-password";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const router = useRouter();

  async function handleGoogleSignIn() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();

      if (mode === "forgot-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/callback?next=/settings`,
        });

        if (error) {
          setError(error.message);
          return;
        }

        setMessage("Check your email for a password reset link!");
        return;
      }

      if (mode === "magic-link") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/callback`,
          },
        });

        if (error) {
          setError(error.message);
          return;
        }

        setMessage("Check your email for a sign-in link!");
        return;
      }

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/callback`,
          },
        });

        if (error) {
          setError(error.message);
          return;
        }

        setMessage("Check your email to confirm your account!");
        return;
      }

      // Login mode
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-none shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#C4704B]/10">
            <span className="text-2xl" role="img" aria-label="Menuly logo">
              🍽
            </span>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {mode === "signup"
              ? "Create Account"
              : mode === "forgot-password"
                ? "Reset Password"
                : mode === "magic-link"
                  ? "Sign In with Email Link"
                  : "Welcome to Menuly"}
          </CardTitle>
          <CardDescription>
            {mode === "signup"
              ? "Create an account to get started"
              : mode === "forgot-password"
                ? "We'll send you a link to reset your password"
                : "Sign in to manage your recipes and meal plans"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Google sign-in */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="mr-2 size-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or continue with email
              </span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            {mode !== "magic-link" && mode !== "forgot-password" && (
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={
                    mode === "signup"
                      ? "Create a password (min 6 chars)"
                      : "Your password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "signup" ? 6 : undefined}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  disabled={isLoading}
                />
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#C4704B] text-white hover:bg-[#B0603F] focus-visible:ring-[#C4704B]/50"
              disabled={isLoading}
            >
              {isLoading
                ? "Please wait..."
                : mode === "signup"
                  ? "Create account"
                  : mode === "magic-link"
                    ? "Send sign-in link"
                    : mode === "forgot-password"
                      ? "Send reset link"
                      : "Sign in"}
            </Button>
          </form>

          {/* Mode switching links */}
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            {mode === "login" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot-password");
                    setError(null);
                    setMessage(null);
                  }}
                  className="block w-full min-h-[44px] py-2 hover:text-foreground transition-colors"
                >
                  Forgot your password?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("magic-link");
                    setError(null);
                    setMessage(null);
                  }}
                  className="block w-full min-h-[44px] py-2 hover:text-foreground transition-colors"
                >
                  Sign in with email link instead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setMessage(null);
                  }}
                  className="block w-full min-h-[44px] py-2 hover:text-foreground transition-colors"
                >
                  Don&apos;t have an account?{" "}
                  <span className="font-medium text-[#C4704B]">Sign up</span>
                </button>
              </>
            )}

            {mode === "signup" && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setMessage(null);
                }}
                className="block w-full min-h-[44px] py-2 hover:text-foreground transition-colors"
              >
                Already have an account?{" "}
                <span className="font-medium text-[#C4704B]">Sign in</span>
              </button>
            )}

            {(mode === "magic-link" || mode === "forgot-password") && (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setMessage(null);
                }}
                className="block w-full min-h-[44px] py-2 hover:text-foreground transition-colors"
              >
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
