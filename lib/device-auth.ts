import {
  DeviceAuthTokenErrorCode,
  type DeviceAuthCodeRequest,
  type DeviceAuthCodeResponse,
  type DeviceAuthTokenRequest,
  type DeviceAuthTokenResponse,
} from "@wxyc/shared/dtos";

/**
 * RFC 8628 device-authorization sign-in, spoken to better-auth's endpoints
 * through the same-origin `/auth` proxy.
 *
 * The shape deliberately mirrors dj-site's `lib/features/authentication/
 * device-auth.ts`. Both talk to the same three endpoints, and the approval
 * surface (`verification_uri`) is dj.wxyc.org either way, so a divergence
 * between the two clients would be a bug rather than a local preference.
 *
 * There is no better-auth client plugin involved here — dj-site drives this
 * with plain fetch too, for the same reason `lib/otp.ts` does.
 */

/** Where the auth proxy is mounted in this app. */
const AUTH_BASE = "/auth";

/**
 * Identifies this app to the device-authorization endpoint. Not a secret and
 * not authenticated — RFC 8628's `client_id` names the device asking, and
 * WXYC's flow identifies the *DJ* later, at approval time on their phone.
 */
export const ARCHIVE_CLIENT_ID = "wxyc-archive";

/**
 * The decision a single `/auth/device/token` poll resolves to.
 *
 * RFC 8628 delivers the non-terminal polling states (`authorization_pending`,
 * `slow_down`) and most terminal states as HTTP 400s, not 2xx — so a caller
 * cannot branch on `response.ok` alone. {@link interpretTokenPoll} collapses
 * the `(status, body)` pair into this union; the polling loop acts on `kind`
 * and never re-inspects the raw wire shape.
 */
export type PollOutcome =
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "success"; token: DeviceAuthTokenResponse }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "error"; code?: DeviceAuthTokenErrorCode | "network" };

const TOKEN_ERROR_CODES = new Set<string>(
  Object.values(DeviceAuthTokenErrorCode)
);

function isTokenErrorCode(value: unknown): value is DeviceAuthTokenErrorCode {
  return typeof value === "string" && TOKEN_ERROR_CODES.has(value);
}

/**
 * Map an `/auth/device/token` HTTP response to a {@link PollOutcome}.
 *
 * Branches exclusively on {@link DeviceAuthTokenErrorCode} members, never on
 * raw string literals, so a contract change surfaces as a type error rather
 * than as a poll that quietly never terminates.
 */
export function interpretTokenPoll(status: number, body: unknown): PollOutcome {
  // Any 200 means the grant was issued and the session cookie is now set, so
  // a 200 is success by status alone — even if the body did not parse.
  // Gating on a truthy access_token would misreport a genuinely signed-in DJ
  // as an error. The token is carried for completeness; the caller re-reads
  // the user through the normal session path rather than consuming it.
  if (status === 200) {
    return { kind: "success", token: (body ?? {}) as DeviceAuthTokenResponse };
  }

  const error = (body as { error?: unknown } | null)?.error;

  if (error === DeviceAuthTokenErrorCode.authorization_pending) {
    return { kind: "pending" };
  }
  if (error === DeviceAuthTokenErrorCode.slow_down) {
    return { kind: "slow_down" };
  }
  if (error === DeviceAuthTokenErrorCode.expired_token) {
    return { kind: "expired" };
  }
  if (error === DeviceAuthTokenErrorCode.access_denied) {
    return { kind: "denied" };
  }

  return isTokenErrorCode(error) ? { kind: "error", code: error } : { kind: "error" };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * POST `/auth/device/code` to begin a device-authorization flow.
 *
 * Throws on a non-2xx: there is no partial success here, and the caller has
 * nothing to render without a `user_code`.
 */
export async function requestDeviceCode(
  clientId: string = ARCHIVE_CLIENT_ID
): Promise<DeviceAuthCodeResponse> {
  const body: DeviceAuthCodeRequest = { client_id: clientId };

  const response = await fetch(`${AUTH_BASE}/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to start device authorization (${response.status})`);
  }

  return (await response.json()) as DeviceAuthCodeResponse;
}

/** The fixed RFC 8628 device-flow grant type. */
const DEVICE_CODE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:device_code" as const;

/**
 * POST one `/auth/device/token` poll.
 *
 * Returns the raw `(status, body)` without judging it — RFC 8628 delivers
 * polling and terminal states alike as 400s, so the decision belongs to
 * {@link interpretTokenPoll}. A JSON parse failure yields `body: null`.
 */
export async function pollDeviceToken(
  deviceCode: string,
  clientId: string = ARCHIVE_CLIENT_ID
): Promise<{ status: number; body: unknown }> {
  const body: DeviceAuthTokenRequest = {
    grant_type: DEVICE_CODE_GRANT_TYPE,
    device_code: deviceCode,
    client_id: clientId,
  };

  const response = await fetch(`${AUTH_BASE}/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await readJson(response) };
}
