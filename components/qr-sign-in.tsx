"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DeviceAuthTokenErrorCode } from "@wxyc/shared/dtos";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  interpretTokenPoll,
  pollDeviceToken,
  requestDeviceCode,
  type PollOutcome,
} from "@/lib/device-auth";

type Phase = "starting" | "waiting" | "expired" | "denied" | "error";

/**
 * How much to add to the poll interval when the server says `slow_down`.
 * RFC 8628 leaves the amount to the client and suggests increasing it; five
 * seconds matches the interval the server hands out in the first place. The
 * growth is bounded by the grant's own expiry, which ends the flow regardless.
 */
const SLOW_DOWN_STEP_MS = 5_000;

/** RFC 8628 defaults, for a grant that omits these or sends nonsense. */
const DEFAULT_INTERVAL_SECONDS = 5;
const DEFAULT_EXPIRES_IN_SECONDS = 300;

/** Rendered size of the QR, shared with the placeholder that stands in for it. */
const QR_SIZE = 220;

/**
 * The only token-endpoint errors that mean this grant can never be redeemed.
 *
 * Everything else the poll can produce — a dropped packet, the `/auth` proxy's
 * 502 on a single upstream hiccup, `server_error` — is transient, and RFC 8628
 * expects a client to poll through it rather than abandoning a scan the DJ is
 * midway through. `expired_token` and `access_denied` are absent because
 * {@link interpretTokenPoll} already lifts them out into their own outcomes.
 */
const TERMINAL_ERROR_CODES = new Set<string>([
  DeviceAuthTokenErrorCode.invalid_request,
  DeviceAuthTokenErrorCode.invalid_grant,
]);

/** A positive number of seconds from the grant, or the protocol default. */
function seconds(value: number | undefined, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

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

  /**
   * The polling effect below owns a whole device-code lifecycle: a grant the
   * server is holding, a QR the DJ is physically pointing a phone at, and a
   * timer. Restarting it throws all three away, so it must not be keyed on
   * React identity — `LoginDialog` renders inside the archive page, which
   * re-renders roughly once a second while audio plays, and a callback prop
   * recreated on each of those renders would replace the QR faster than the
   * first poll could fire. Reading the callbacks through a ref leaves
   * `attempt` as the only thing that can restart the flow, whatever the
   * caller's memoization hygiene happens to be.
   */
  const latest = useRef({ completeSignIn, onSignedIn });
  useEffect(() => {
    latest.current = { completeSignIn, onSignedIn };
  });

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
          width: QR_SIZE,
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        // Rendering failed, but the user code below the QR is still usable.
      }
      if (cancelled) return;
      setPhase("waiting");

      // A grant with a zero, negative, or missing interval must not become a
      // tight loop against a token endpoint the auth service deliberately does
      // not rate-limit.
      let intervalMs =
        seconds(grant.interval, DEFAULT_INTERVAL_SECONDS) * 1000;

      // The grant's own expiry is what ends a flow that keeps hitting
      // transient failures; without this ceiling a server that never answers
      // `expired_token` would be polled forever.
      const expiresAt =
        Date.now() +
        seconds(grant.expires_in, DEFAULT_EXPIRES_IN_SECONDS) * 1000;

      const poll = async () => {
        if (cancelled) return;

        let outcome: PollOutcome;
        try {
          const { status, body } = await pollDeviceToken(grant.device_code);
          outcome = interpretTokenPoll(status, body);
        } catch {
          outcome = { kind: "error", code: "network" };
        }
        if (cancelled) return;

        switch (outcome.kind) {
          case "pending":
            scheduleNext();
            return;
          case "slow_down":
            intervalMs += SLOW_DOWN_STEP_MS;
            scheduleNext();
            return;
          case "success": {
            // The token endpoint set the session cookie; the station-role gate
            // still decides whether this account may reach the archive.
            let result;
            try {
              result = await latest.current.completeSignIn();
            } catch {
              result = {
                success: false as const,
                error:
                  "Could not verify your archive access. Please try again.",
              };
            }
            // The cookie is already set, so the DJ is signed in whether or not
            // this component still is. Report a success even after an unmount
            // or a restart, or the dialog sits open over a live session. A
            // failure is only worth telling a component still on screen, which
            // is the guard `fail` already applies.
            if (result.success) {
              latest.current.onSignedIn();
              return;
            }
            fail(result.error);
            return;
          }
          case "expired":
            setPhase("expired");
            return;
          case "denied":
            setPhase("denied");
            return;
          case "error":
            if (outcome.code && TERMINAL_ERROR_CODES.has(outcome.code)) {
              fail("Something went wrong. Please try again.");
              return;
            }
            // Transient: keep the grant alive and try again.
            scheduleNext();
            return;
          default: {
            // A new PollOutcome kind lands here as a type error rather than as
            // a poll that silently stops. Until then, treat it as transient.
            const unhandled: never = outcome;
            void unhandled;
            scheduleNext();
            return;
          }
        }
      };

      const scheduleNext = () => {
        if (cancelled) return;
        if (Date.now() >= expiresAt) {
          setPhase("expired");
          return;
        }
        timer = setTimeout(poll, intervalMs);
      };

      scheduleNext();
    }

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [attempt]);

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
        {/* The one phase with no button of its own. A stalled
            /auth/device/code would otherwise leave closing the dialog as the
            only way out — and reopening it lands right back here, because the
            QR preference was already stored on the way in. */}
        {usePasswordLink}
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
            width={QR_SIZE}
            height={QR_SIZE}
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
