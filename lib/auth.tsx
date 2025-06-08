"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { randomBytes } from "crypto";

// Credentials from environment variables
const VALID_CREDENTIALS = {
  username: process.env.NEXT_PUBLIC_AUTH_USERNAME || "",
  password: process.env.NEXT_PUBLIC_AUTH_PASSWORD || "",
};

type AuthContextType = {
  isAuthenticated: boolean;
  authToken: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Check localStorage on mount
  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated");
    const token = localStorage.getItem("authToken");
    if (auth === "true" && token) {
      setIsAuthenticated(true);
      setAuthToken(token);
    }
  }, []);

  const login = (username: string, password: string) => {
    const isValid =
      username === VALID_CREDENTIALS.username &&
      password === VALID_CREDENTIALS.password;

    if (isValid) {
      // Generate a secure random token
      const token = randomBytes(32).toString("hex");
      setIsAuthenticated(true);
      setAuthToken(token);
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("authToken", token);
    }

    return isValid;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setAuthToken(null);
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("authToken");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, authToken, login, logout }}>
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
