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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [simpleAuthed, setSimpleAuthed] = useState(false);

  const userRole = user?.role ?? null;
  const isAuthenticated = useSimpleAuth
    ? simpleAuthed
    : isDJRole(userRole);

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

          // Check if user has DJ role
          if (!isDJRole(userData.role)) {
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
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (useSimpleAuth) return null;
    if (!session) return null;
    return getJWTToken();
  }, [session]);

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
