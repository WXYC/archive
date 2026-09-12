"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  interpretTokenPoll,
  pollDeviceToken,
  requestDeviceCode,
} from "@/lib/device-auth";

type Phase = "starting" | "waiting" | "expired" | "denied" | "error";

/**
 * How much to add to the poll interval when the server says `slow_down`.
 * RFC 8628 leaves the amount to the client and suggests increasing it; five
 * seconds matches the interval the server hands out in the first place.
 */
const SLOW_DOWN_STEP_MS = 5_000;

/**
 * QR sign-in for the shared control-room machine.
 *
 * The DJ scans with the WXYC DJ app on their phone and approves there, so no
 * credentials are typed on a shared keyboard. Approval happens on
 * dj.wxyc.org — the `verification_uri` the server returns — which is why this
 * flow only works when dj-site's half is enabled too.
 */
export function QrSignIn({
  onSignedIn,
  onUsePassword,
}: {
  onSignedIn: () => void;
  onUsePassword: () => void;
}) {
  const { completeSignIn } = useAuth();
  const [phase, setPhase] = useState<Phase>("starting");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  /** Bumping this restarts the whole flow with a fresh device code. */
  const [attempt, setAttempt] = useState(0);

  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (text: string) => {
      if (cancelled) return;
      setPhase("error");
      setMessage(text);
    };

    async function run() {
      setPhase("starting");
      setQrDataUrl(null);
      setUserCode(null);
      setMessage("");

      let grant;
      try {
        grant = await requestDeviceCode();
      } catch {
        fail("Could not start QR sign-in. Please try again.");
        return;
      }
      if (cancelled) return;

      setUserCode(grant.user_code);

      // The complete URI embeds the code so the phone needs no typing. If the
      // server omits it, the plain verification URI plus the visible code
      // still gets the DJ there.
      const target = grant.verification_uri_complete ?? grant.verification_uri;
      try {
        const dataUrl = await QRCode.toDataURL(target, {
          margin: 1,
          width: 220,
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        // Rendering failed, but the user code below the QR is still usable.
      }
      if (cancelled) return;
      setPhase("waiting");

      let intervalMs = (grant.interval ?? 5) * 1000;

      const poll = async () => {
        if (cancelled) return;

        let outcome;
        try {
          const { status, body } = await pollDeviceToken(grant.device_code);
          outcome = interpretTokenPoll(status, body);
        } catch {
          outcome = { kind: "error" as const, code: "network" as const };
        }
        if (cancelled) return;

        switch (outcome.kind) {
          case "pending":
            timer = setTimeout(poll, intervalMs);
            return;
          case "slow_down":
            intervalMs += SLOW_DOWN_STEP_MS;
            timer = setTimeout(poll, intervalMs);
            return;
          case "success": {
            // The token endpoint set the session cookie; the station-role gate
            // still decides whether this account may reach the archive.
            const result = await completeSignIn();
            if (cancelled) return;
            if (result.success) onSignedIn();
            else fail(result.error);
            return;
          }
          case "expired":
            setPhase("expired");
            return;
          case "denied":
            setPhase("denied");
            return;
          default:
            fail("Something went wrong. Please try again.");
        }
      };

      timer = setTimeout(poll, intervalMs);
    }

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [attempt, completeSignIn, onSignedIn]);

  const usePasswordLink = (
    <Button
      type="button"
      variant="link"
      className="w-full"
      onClick={onUsePassword}
    >
      Use a password instead
    </Button>
  );

  if (phase === "starting") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">Preparing a code…</p>
      </div>
    );
  }

  if (phase === "expired" || phase === "denied" || phase === "error") {
    const text =
      phase === "expired"
        ? "That code expired before it was approved."
        : phase === "denied"
          ? "Sign-in was declined on the phone. Accounts without DJ access can't use QR sign-in."
          : message;

    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-red-500">
          {text}
        </p>
        <Button type="button" className="w-full" onClick={restart}>
          Show a new code
        </Button>
        {usePasswordLink}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Scan this with the WXYC DJ app on your phone, then approve the sign-in
        there.
      </p>
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code for signing in with the WXYC DJ app"
            width={220}
            height={220}
            className="rounded-md bg-white p-2"
          />
        ) : (
          <div className="flex h-[220px] w-[220px] items-center justify-center rounded-md border text-sm text-muted-foreground">
            Code unavailable
          </div>
        )}
      </div>
      {userCode && (
        <p className="text-center text-sm text-muted-foreground">
          Waiting for <span className="font-mono font-medium">{userCode}</span>
        </p>
      )}
      {usePasswordLink}
    </div>
  );
}
