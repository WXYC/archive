import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DeviceAuthTokenErrorCode } from "@wxyc/shared/dtos";
import { QrSignIn } from "../qr-sign-in";

const mockRequestDeviceCode = vi.fn();
const mockPollDeviceToken = vi.fn();
const mockCompleteSignIn = vi.fn();
const mockToDataURL = vi.fn();

vi.mock("@/lib/device-auth", async () => {
  // interpretTokenPoll is a pure function over (status, body); the component's
  // behavior depends on it being the real one, so only the I/O is faked.
  const actual = await vi.importActual<typeof import("@/lib/device-auth")>(
    "@/lib/device-auth"
  );
  return {
    ...actual,
    requestDeviceCode: () => mockRequestDeviceCode(),
    pollDeviceToken: (code: string) => mockPollDeviceToken(code),
  };
});

// A fresh wrapper per render, deliberately: the real context value is a new
// object literal on every AuthProvider render, and the component must not
// restart its device grant because a callback's identity moved.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    completeSignIn: (...args: unknown[]) => mockCompleteSignIn(...args),
  }),
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: (text: string) => mockToDataURL(text) },
}));

const GRANT = {
  device_code: "dev-1",
  user_code: "L22TDY5F",
  verification_uri: "https://dj.wxyc.org/device-auth",
  verification_uri_complete:
    "https://dj.wxyc.org/device-auth?user_code=L22TDY5F",
  expires_in: 300,
  interval: 5,
};

/** One poll interval, as handed out by the fixture grant. */
const TICK = 5000;

beforeEach(() => {
  vi.clearAllMocks();
  // shouldAdvanceTime keeps real time moving under the fake clock, so RTL's
  // waitFor/findBy (which poll on real timers) still settle while the
  // component's polling interval stays under the test's control.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockRequestDeviceCode.mockResolvedValue(GRANT);
  mockToDataURL.mockResolvedValue("data:image/png;base64,QR");
});

afterEach(() => {
  vi.useRealTimers();
});

function renderQr() {
  const onSignedIn = vi.fn();
  const onUsePassword = vi.fn();
  return {
    onSignedIn,
    onUsePassword,
    ...render(
      <QrSignIn onSignedIn={onSignedIn} onUsePassword={onUsePassword} />
    ),
  };
}

const pending = {
  status: 400,
  body: { error: DeviceAuthTokenErrorCode.authorization_pending },
};

describe("QrSignIn", () => {
  it("shows the QR and the user code once a device code is issued", async () => {
    renderQr();

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByText("L22TDY5F")).toBeInTheDocument();
    // The QR encodes the complete URI so the phone needs no typing.
    expect(mockToDataURL).toHaveBeenCalledWith(
      GRANT.verification_uri_complete
    );
  });

  it("still shows the code when the QR image cannot be rendered", async () => {
    mockToDataURL.mockRejectedValue(new Error("canvas unavailable"));
    renderQr();

    expect(await screen.findByText("L22TDY5F")).toBeInTheDocument();
    expect(screen.getByText(/code unavailable/i)).toBeInTheDocument();
  });

  it("keeps polling while approval is pending, then signs in", async () => {
    mockPollDeviceToken
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ status: 200, body: { access_token: "t" } });
    mockCompleteSignIn.mockResolvedValue({ success: true });
    const { onSignedIn } = renderQr();

    await screen.findByRole("img");

    await vi.advanceTimersByTimeAsync(TICK);
    expect(onSignedIn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TICK);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(mockCompleteSignIn).toHaveBeenCalled();
  });

  it("refuses an approved device whose account lacks archive access", async () => {
    mockPollDeviceToken.mockResolvedValue({ status: 200, body: {} });
    mockCompleteSignIn.mockResolvedValue({
      success: false,
      error: "Your account does not have archive access",
    });
    const { onSignedIn } = renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);

    expect(
      await screen.findByText(/does not have archive access/i)
    ).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("backs off when the server says slow_down", async () => {
    mockPollDeviceToken
      .mockResolvedValueOnce({
        status: 400,
        body: { error: DeviceAuthTokenErrorCode.slow_down },
      })
      .mockResolvedValue(pending);
    renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(1);

    // The next poll is now 10s out, not 5s: at 5s nothing more has happened.
    await vi.advanceTimersByTimeAsync(TICK);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TICK);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(2);
  });

  it("offers a fresh code when the old one expires", async () => {
    mockPollDeviceToken.mockResolvedValue({
      status: 400,
      body: { error: DeviceAuthTokenErrorCode.expired_token },
    });
    renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);

    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /show a new code/i })
    ).toBeInTheDocument();
    // Polling stops once the flow is terminal.
    const callsAtExpiry = mockPollDeviceToken.mock.calls.length;
    await vi.advanceTimersByTimeAsync(TICK * 3);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(callsAtExpiry);
  });

  it("explains a decline in terms of DJ access", async () => {
    mockPollDeviceToken.mockResolvedValue({
      status: 400,
      body: { error: DeviceAuthTokenErrorCode.access_denied },
    });
    renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);

    // Per dj-site's ADR 0005, `member` accounts are rejected at approval, so
    // "declined" needs to point at the likely cause rather than just failing.
    expect(await screen.findByText(/declined/i)).toBeInTheDocument();
    expect(screen.getByText(/DJ access/i)).toBeInTheDocument();
  });

  it("reports a flow that could not be started", async () => {
    mockRequestDeviceCode.mockRejectedValue(new Error("boom"));
    renderQr();

    expect(
      await screen.findByText(/could not start qr sign-in/i)
    ).toBeInTheDocument();
    expect(mockPollDeviceToken).not.toHaveBeenCalled();
  });

  it("stops polling once unmounted", async () => {
    mockPollDeviceToken.mockResolvedValue(pending);
    const { unmount } = renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);
    const callsBefore = mockPollDeviceToken.mock.calls.length;

    unmount();
    await vi.advanceTimersByTimeAsync(TICK * 4);

    expect(mockPollDeviceToken).toHaveBeenCalledTimes(callsBefore);
  });

  it("keeps one device code across parent re-renders that change prop identity", async () => {
    mockPollDeviceToken.mockResolvedValue(pending);
    // The real caller sits inside the archive page, which re-renders about
    // once a second while audio plays. Each render used to hand QrSignIn a new
    // `finishSignedIn` closure and restart the flow, replacing the QR the DJ
    // was mid-scan and hammering /auth/device/code.
    const { rerender } = render(
      <QrSignIn onSignedIn={() => {}} onUsePassword={() => {}} />
    );

    await screen.findByRole("img");

    for (let i = 0; i < 5; i++) {
      rerender(<QrSignIn onSignedIn={() => {}} onUsePassword={() => {}} />);
    }
    await vi.advanceTimersByTimeAsync(TICK);

    expect(mockRequestDeviceCode).toHaveBeenCalledTimes(1);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(1);
    expect(screen.getByText("L22TDY5F")).toBeInTheDocument();
  });

  it("polls through transient failures instead of ending the flow", async () => {
    mockPollDeviceToken
      // A dropped packet.
      .mockRejectedValueOnce(new Error("offline"))
      // What the /auth proxy returns on a single upstream hiccup.
      .mockResolvedValueOnce({
        status: 502,
        body: { error: "Auth service unavailable" },
      })
      .mockResolvedValueOnce({
        status: 400,
        body: { error: DeviceAuthTokenErrorCode.server_error },
      })
      .mockResolvedValue({ status: 200, body: { access_token: "t" } });
    mockCompleteSignIn.mockResolvedValue({ success: true });
    const { onSignedIn } = renderQr();

    await screen.findByRole("img");

    await vi.advanceTimersByTimeAsync(TICK * 3);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(TICK);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it("gives up on an error code the grant cannot recover from", async () => {
    mockPollDeviceToken.mockResolvedValue({
      status: 400,
      body: { error: DeviceAuthTokenErrorCode.invalid_grant },
    });
    renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);

    expect(
      await screen.findByText(/something went wrong/i)
    ).toBeInTheDocument();
    const callsAtFailure = mockPollDeviceToken.mock.calls.length;
    await vi.advanceTimersByTimeAsync(TICK * 3);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(callsAtFailure);
  });

  it("stops retrying once the grant's own expiry passes", async () => {
    mockRequestDeviceCode.mockResolvedValue({ ...GRANT, expires_in: 12 });
    mockPollDeviceToken.mockRejectedValue(new Error("offline"));
    renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK * 4);

    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    const callsAtExpiry = mockPollDeviceToken.mock.calls.length;
    await vi.advanceTimersByTimeAsync(TICK * 3);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(callsAtExpiry);
  });

  it("reports a failure to verify access rather than stranding the code", async () => {
    mockPollDeviceToken.mockResolvedValue({ status: 200, body: {} });
    mockCompleteSignIn.mockRejectedValue(new Error("network"));
    const { onSignedIn } = renderQr();

    await screen.findByRole("img");
    await vi.advanceTimersByTimeAsync(TICK);

    expect(
      await screen.findByText(/could not verify your archive access/i)
    ).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("ignores a grant interval that would busy-poll", async () => {
    mockRequestDeviceCode.mockResolvedValue({ ...GRANT, interval: 0 });
    mockPollDeviceToken.mockResolvedValue(pending);
    renderQr();

    await screen.findByRole("img");

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockPollDeviceToken).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TICK);
    expect(mockPollDeviceToken).toHaveBeenCalledTimes(1);
  });

  it("offers the password form while the code is still being prepared", async () => {
    let release: (grant: typeof GRANT) => void = () => {};
    mockRequestDeviceCode.mockReturnValue(
      new Promise<typeof GRANT>((resolve) => {
        release = resolve;
      })
    );
    renderQr();

    expect(screen.getByText(/preparing a code/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use a password instead/i })
    ).toBeInTheDocument();

    release(GRANT);
    await screen.findByRole("img");
  });
});
