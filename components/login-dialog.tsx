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
import { isQrLoginEnabled } from "@/lib/flags";
import { QrSignIn } from "@/components/qr-sign-in";

type LoginMethod = "otp" | "password" | "qr";

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
    const stored = localStorage.getItem(METHOD_STORAGE_KEY);
    if (stored === "password") return "password";
    // A stored "qr" is only honored while the flag is on, so a browser that
    // opted into QR before it was turned off is not stranded on a method it
    // can no longer reach.
    if (stored === "qr" && isQrLoginEnabled()) return "qr";
    return "otp";
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
      // Drop any secret left over from a dismissed attempt. A failed sign-in
      // keeps the dialog open, so a password only survives to here if the user
      // deliberately closed it — and this is the shared control-room machine.
      // The identifier is left in place: it is not a secret, and the usual
      // reason to reopen is to correct it.
      setPassword("");
      // Escape closes the dialog mid-request, and isSubmitting would otherwise
      // survive into the next open — rendering a fresh form with every field
      // disabled until an abandoned request happens to settle.
      setIsSubmitting(false);
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

  /**
   * Request a code for whatever the identifier field currently holds. Sending
   * the first code and resending one differ only in what they say afterwards,
   * so the request, the form lock and the failure rendering live here once.
   */
  const requestCode = async (
    identifier: string,
    onSent: (email: string) => void
  ) => {
    clearFeedback();
    setIsSubmitting(true);

    try {
      const result = await sendLoginCode(identifier);
      if (result.success) {
        onSent(result.email);
      } else {
        setError(result.error);
        setErrorKind(result.kind ?? null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    return requestCode(usernameOrEmail, (email) => setCodeSentTo(email));
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
    } catch {
      // Unlike login(), verifyLoginCode can reject: it reaches completeSignIn,
      // whose authClient.getSession() call is not wrapped. Without this the
      // button would just snap back to "Sign In" with nothing said, and the
      // obvious retry fails because the server has already spent the code.
      setError("Could not complete sign-in. Please request a new code.");
      setErrorKind(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend against the address the first code reached, not the raw identifier.
  // resolveEmail returns anything containing "@" as-is, so this skips the
  // username lookup; re-running it would let one transient 5xx answer "no
  // account matches that username or email" on the very screen that just
  // named the mailbox.
  const handleResend = () =>
    requestCode(codeSentTo ?? usernameOrEmail, (email) =>
      setNotice(`A new code is on its way to ${email}.`)
    );

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
      {/* role=status, not alert: resending is a confirmation, and it is the
          only feedback a resend produces, so without a live region a screen
          reader user hears nothing at all after pressing the button. */}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </>
  );

  const qrLink = isQrLoginEnabled() ? (
    <Button
      type="button"
      variant="link"
      className="w-full"
      onClick={() => switchMethod("qr")}
      disabled={isSubmitting}
    >
      Sign in with a QR code
    </Button>
  ) : null;

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

        {method === "qr" ? (
          <QrSignIn
            onSignedIn={finishSignedIn}
            onUsePassword={() => switchMethod("password")}
          />
        ) : method === "password" ? (
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
            {qrLink}
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
            {qrLink}
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
                // Advancing to this stage replaces the form that held focus,
                // which would otherwise drop focus to the body and strand
                // keyboard and screen-reader users mid-flow. Radix only
                // manages focus when the dialog itself opens, not across a
                // stage change inside it.
                autoFocus
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
