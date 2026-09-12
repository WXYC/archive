"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function LoginDialog() {
  const { login, logout, isAuthenticated, isLoading, user } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Distinguishes guidance ("that login no longer exists") from a plain
  // credential rejection, which the two are rendered differently for.
  const [errorKind, setErrorKind] = useState<
    "retired-shared-credential" | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setErrorKind(null);
    setIsSubmitting(true);

    try {
      const result = await login(usernameOrEmail, password);
      if (result.success) {
        setIsOpen(false);
        setUsernameOrEmail("");
        setPassword("");
      } else {
        setError(result.error);
        setErrorKind(result.kind ?? null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        Loading...
      </Button>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        {user && (
          <span className="text-sm text-muted-foreground">{user.name}</span>
        )}
        <Button variant="outline" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">DJ Sign In</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>DJ Sign In</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="usernameOrEmail">Username or Email</Label>
            <Input
              id="usernameOrEmail"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="your.name or your.name@wxyc.org"
              disabled={isSubmitting}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
          {error &&
            (errorKind === "retired-shared-credential" ? (
              <div
                role="alert"
                className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
              >
                <p>{error}</p>
                <a
                  href="https://dj.wxyc.org"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-medium underline underline-offset-4"
                >
                  Go to dj.wxyc.org
                </a>
              </div>
            ) : (
              <p className="text-sm text-red-500">{error}</p>
            ))}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
