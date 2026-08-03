"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  authClient,
  getJWTToken,
  isDJRole,
  DJ_ROLES,
} from "@wxyc/shared/auth-client";
import type { Session } from "@wxyc/shared/auth-client";
import { decodeJwt } from "jose";

// Extended user type. NOTE: `role` here is the better-auth admin-plugin role
// (null for a plain dj, "admin" for elevated accounts), NOT the WXYC station
// role. Do not gate archive access on it — use the JWT station role resolved
// by fetchStationRole instead (see the userRole field on the context, which
// exposes that station role).
type User = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string;
};

type LoginResult = { success: true } | { success: false; error: string };

type AuthContextType = {
  isLoading: boolean;
  isAuthenticated: boolean;
  session: Session | null;
  user: User | null;
  userRole: string | null;
  login: (usernameOrEmail: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { DJ_ROLES, isDJRole };

const SIMPLE_AUTH_KEY = "wxyc-archive-auth";
const useSimpleAuth =
  !!process.env.NEXT_PUBLIC_AUTH_USERNAME &&
  !!process.env.NEXT_PUBLIC_AUTH_PASSWORD;

// Tolerance for client/server clock skew when treating a decoded JWT as
// expired. We only discard a token that is expired by more than this, so a
// slightly fast client clock never logs out a DJ who is holding a token the
// server would still accept.
const JWT_CLOCK_SKEW_MS = 60_000;

// Result of resolving the station role from the JWT. `"unavailable"` means we
// could not determine a role at all — no token, a token-fetch or decode
// failure, or an expired token. That is a transient/system condition, distinct
// from a user who successfully decoded to a non-DJ role. Callers fail closed on
// both but report them differently.
type StationRoleResult =
  | {
      status: "ok";
      role: string | null;
      token: string;
      expiresAt: number | null;
    }
  | { status: "unavailable" };

/**
 * Resolve the WXYC station role (dj, musicDirector, stationManager, member,
 * ...) from the better-auth JWT `role` claim. This is distinct from
 * `session.user.role`, which is the better-auth admin-plugin role and is
 * null for plain DJs. The JWT is decoded client-side without signature
 * verification purely to gate UI state; the server independently re-verifies
 * the JWT (see lib/jwt-utils.ts) before honoring any download request.
 *
 * Never throws: any failure to fetch or decode the token yields
 * `{ status: "unavailable" }` so the UI fails closed.
 */
async function fetchStationRole(): Promise<StationRoleResult> {
  let token: string | null;
  try {
    token = await getJWTToken();
  } catch (error) {
    console.error("Failed to fetch JWT for station role:", error);
    return { status: "unavailable" };
  }
  if (!token) return { status: "unavailable" };

  try {
    const payload = decodeJwt(token);
    const expiresAt =
      typeof payload.exp === "number" ? payload.exp * 1000 : null;
    if (expiresAt !== null && expiresAt + JWT_CLOCK_SKEW_MS < Date.now()) {
      // Already expired; the server would reject it, so don't treat the user
      // as authenticated off a stale token.
      return { status: "unavailable" };
    }
    const role = typeof payload.role === "string" ? payload.role : null;
    return { status: "ok", role, token, expiresAt };
  } catch (error) {
    console.error("Failed to decode JWT for station role:", error);
    return { status: "unavailable" };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [simpleAuthed, setSimpleAuthed] = useState(false);
  const [stationRole, setStationRole] = useState<string | null>(null);

  // Cache the JWT fetched while resolving the station role so getToken() can
  // reuse it instead of issuing another /auth/token round-trip on every
  // download. Cleared on logout and whenever the role becomes unavailable.
  const tokenCacheRef = useRef<{
    value: string;
    expiresAt: number | null;
  } | null>(null);

  const isAuthenticated = useSimpleAuth ? simpleAuthed : isDJRole(stationRole);

  // Resolve the station role, then sync both the gating state and the token
  // cache. Returns the result so callers can distinguish "not a DJ" from
  // "couldn't determine access".
  const resolveStationRole =
    useCallback(async (): Promise<StationRoleResult> => {
      const result = await fetchStationRole();
      if (result.status === "ok") {
        setStationRole(result.role);
        tokenCacheRef.current = {
          value: result.token,
          expiresAt: result.expiresAt,
        };
      } else {
        setStationRole(null);
        tokenCacheRef.current = null;
      }
      return result;
    }, []);

  // Check session on mount
  useEffect(() => {
    if (useSimpleAuth) {
      setSimpleAuthed(localStorage.getItem(SIMPLE_AUTH_KEY) === "true");
      setIsLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const { data } = await authClient.getSession();
        if (data?.session && data?.user) {
          setSession(data.session);
          setUser(data.user as User);
          await resolveStationRole();
        }
      } catch (error) {
        console.error("Failed to check session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, [resolveStationRole]);

  const login = useCallback(
    async (usernameOrEmail: string, password: string): Promise<LoginResult> => {
      if (useSimpleAuth) {
        if (
          usernameOrEmail === process.env.NEXT_PUBLIC_AUTH_USERNAME &&
          password === process.env.NEXT_PUBLIC_AUTH_PASSWORD
        ) {
          setSimpleAuthed(true);
          localStorage.setItem(SIMPLE_AUTH_KEY, "true");
          return { success: true };
        }
        return { success: false, error: "Invalid credentials" };
      }

      try {
        // Determine if input is email or username
        const isEmail = usernameOrEmail.includes("@");

        const result = isEmail
          ? await authClient.signIn.email({ email: usernameOrEmail, password })
          : await authClient.signIn.username({
              username: usernameOrEmail,
              password,
            });

        if (result.error) {
          return {
            success: false,
            error: result.error.message ?? "Login failed",
          };
        }

        // Sign in successful, session cookie is set
        // Now fetch the session to get user data
        const sessionResult = await authClient.getSession();
        if (sessionResult.data?.session && sessionResult.data?.user) {
          setSession(sessionResult.data.session);
          setUser(sessionResult.data.user as User);

          // Gate on the WXYC station role from the JWT claim, not the
          // admin-plugin session.user.role (null for a plain dj). See
          // fetchStationRole above; mirrors the server signed-url gate.
          const roleResult = await resolveStationRole();

          if (roleResult.status !== "ok") {
            // We couldn't fetch or decode the token — a transient/system
            // failure, not an authorization decision. Don't tell a DJ they
            // lack access when we simply couldn't check.
            return {
              success: false,
              error: "Could not verify your archive access. Please try again.",
            };
          }

          if (!isDJRole(roleResult.role)) {
            return {
              success: false,
              error: "Your account does not have archive access",
            };
          }

          return { success: true };
        }

        return { success: false, error: "Login failed" };
      } catch (error) {
        console.error("Login error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Login failed",
        };
      }
    },
    [resolveStationRole]
  );

  const logout = useCallback(async () => {
    if (useSimpleAuth) {
      setSimpleAuthed(false);
      localStorage.removeItem(SIMPLE_AUTH_KEY);
      return;
    }

    try {
      await authClient.signOut();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setSession(null);
      setUser(null);
      setStationRole(null);
      tokenCacheRef.current = null;
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (useSimpleAuth) {
      // The server route recognizes the simple-auth password as a Bearer
      // token and grants DJ-range access. Without this, simple-auth users
      // see the 90-day calendar but the server refuses anything past the
      // public window. `useSimpleAuth` already proves the env var is set.
      return simpleAuthed ? process.env.NEXT_PUBLIC_AUTH_PASSWORD! : null;
    }
    if (!session) return null;

    // Reuse the JWT already fetched while resolving the station role, unless
    // it is within the clock-skew window of expiring. This avoids a redundant
    // /auth/token round-trip on the download hot path.
    const cached = tokenCacheRef.current;
    if (
      cached &&
      (cached.expiresAt === null ||
        cached.expiresAt - JWT_CLOCK_SKEW_MS > Date.now())
    ) {
      return cached.value;
    }
    return getJWTToken();
  }, [session, simpleAuthed]);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        session,
        user,
        userRole: stationRole,
        login,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
