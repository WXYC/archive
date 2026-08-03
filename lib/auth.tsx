"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  authClient,
  getJWTToken,
  isDJRole,
  DJ_ROLES,
} from "@wxyc/shared/auth-client";
import type { Session } from "@wxyc/shared/auth-client";
import { decodeJwt } from "jose";

// Extended user type with custom role field
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

/**
 * Resolve the WXYC station role (dj, musicDirector, stationManager, member,
 * ...) from the better-auth JWT `role` claim. This is distinct from
 * `session.user.role`, which is the better-auth admin-plugin role and is
 * null for plain DJs. The JWT is decoded client-side without signature
 * verification purely to gate UI state; the server independently re-verifies
 * the JWT (see lib/jwt-utils.ts) before honoring any download request.
 */
async function fetchStationRole(): Promise<string | null> {
  const token = await getJWTToken();
  if (!token) return null;

  try {
    const payload = decodeJwt(token);
    return (payload.role as string) ?? null;
  } catch (error) {
    console.error("Failed to decode JWT for station role:", error);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [simpleAuthed, setSimpleAuthed] = useState(false);
  const [stationRole, setStationRole] = useState<string | null>(null);

  const userRole = stationRole;
  const isAuthenticated = useSimpleAuth ? simpleAuthed : isDJRole(stationRole);

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
          setStationRole(await fetchStationRole());
        }
      } catch (error) {
        console.error("Failed to check session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

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
          const userData = sessionResult.data.user as User;
          setUser(userData);

          // Gate on the WXYC station role from the JWT claim, not the
          // admin-plugin session.user.role (null for a plain dj). See
          // fetchStationRole above; mirrors the server signed-url gate.
          const role = await fetchStationRole();
          setStationRole(role);

          if (!isDJRole(role)) {
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
    []
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
    return getJWTToken();
  }, [session, simpleAuthed]);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        session,
        user,
        userRole,
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
