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

type LoginMethod = "otp" | "password";

/**
 * Remembers which sign-in method this browser used last. The control-room
 * machine is shared, so the useful thing to persist is the method, never the
 * identity — no username is stored here.
 */
const METHOD_STORAGE_KEY = "wxyc-archive-login-method";

/**
 * Default to the emailed code, matching dj.wxyc.org. On a shared keyboard it
 * beats typing a password, and it is the method a DJ will have seen already.
 * Reading is defensive: happy-dom and private-mode browsers can both make
 * localStorage absent or throwing, and a sign-in dialog must still open.
 */
function readPreferredMethod(): LoginMethod {
  try {
    if (typeof localStorage === "undefined") return "otp";
    return localStorage.getItem(METHOD_STORAGE_KEY) === "password"
      ? "password"
      : "otp";
  } catch {
    return "otp";
  }
}

function savePreferredMethod(method: LoginMethod): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(METHOD_STORAGE_KEY, method);
  } catch {
    // Preference is a convenience; losing it must never break sign-in.
  }
}

export function LoginDialog() {
  const {
    login,
    sendLoginCode,
    verifyLoginCode,
    logout,
    isAuthenticated,
    isLoading,
    user,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [method, setMethod] = useState<LoginMethod>("otp");
  /** Set once a code has been sent; also the address to verify against. */
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<
    "retired-shared-credential" | null
  >(null);
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFeedback = () => {
    setError("");
    setErrorKind(null);
    setNotice("");
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Restore the remembered method on open rather than at mount, so a
      // choice made in one session is picked up by the next without a reload.
      setMethod(readPreferredMethod());
      setCodeSentTo(null);
      setCode("");
      clearFeedback();
    }
  };

  const switchMethod = (next: LoginMethod) => {
    setMethod(next);
    savePreferredMethod(next);
    setCodeSentTo(null);
    setCode("");
    clearFeedback();
  };

  const finishSignedIn = () => {
    setIsOpen(false);
    setUsernameOrEmail("");
    setPassword("");
    setCode("");
    setCodeSentTo(null);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setIsSubmitting(true);

    try {
      const result = await login(usernameOrEmail, password);
      if (result.success) {
        finishSignedIn();
      } else {
        setError(result.error);
        setErrorKind(result.kind ?? null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setIsSubmitting(true);

    try {
      const result = await sendLoginCode(usernameOrEmail);
      if (result.success) {
        setCodeSentTo(result.email);
      } else {
        setError(result.error);
        setErrorKind(result.kind ?? null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeSentTo) return;
    clearFeedback();
    setIsSubmitting(true);

    try {
      const result = await verifyLoginCode(codeSentTo, code.trim());
      if (result.success) {
        finishSignedIn();
      } else {
        setError(result.error);
        setErrorKind(result.kind ?? null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    clearFeedback();
    setIsSubmitting(true);
    try {
      const result = await sendLoginCode(usernameOrEmail);
      if (result.success) {
        setNotice(`A new code is on its way to ${result.email}.`);
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

  const feedback = (
    <>
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
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
    </>
  );

  const identifierField = (
    <div className="space-y-2">
      <Label htmlFor="usernameOrEmail">Username or Email</Label>
      <Input
        id="usernameOrEmail"
        value={usernameOrEmail}
        onChange={(e) => setUsernameOrEmail(e.target.value)}
        placeholder="your.name or your.name@wxyc.org"
        disabled={isSubmitting}
        autoCapitalize="none"
        autoCorrect="off"
        required
      />
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">DJ Sign In</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>DJ Sign In</DialogTitle>
        </DialogHeader>

        {method === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {identifierField}
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
            {feedback}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => switchMethod("otp")}
              disabled={isSubmitting}
            >
              Email me a code instead
            </Button>
          </form>
        ) : codeSentTo === null ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            {identifierField}
            <p className="text-sm text-muted-foreground">
              We&apos;ll email a 6-digit code to the address on your account.
            </p>
            {feedback}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Email me a code"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => switchMethod("password")}
              disabled={isSubmitting}
            >
              Use a password instead
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to {codeSentTo}.
            </p>
            <div className="space-y-2">
              <Label htmlFor="code">Login code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={isSubmitting}
                required
              />
            </div>
            {feedback}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="link"
                onClick={handleResend}
                disabled={isSubmitting}
              >
                Resend code
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={() => switchMethod("otp")}
                disabled={isSubmitting}
              >
                Use a different account
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
