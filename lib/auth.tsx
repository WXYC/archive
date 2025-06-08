"use client";

import { createContext, useContext, useState, useEffect } from "react";

// Credentials from environment variables
const VALID_CREDENTIALS = {
  username: process.env.NEXT_PUBLIC_AUTH_USERNAME || "",
  password: process.env.NEXT_PUBLIC_AUTH_PASSWORD || "",
};

type AuthContextType = {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const auth = localStorage.getItem("isAuthenticated");
    if (auth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const login = (username: string, password: string) => {
    const isValid =
      username === VALID_CREDENTIALS.username &&
      password === VALID_CREDENTIALS.password;

    if (isValid) {
      setIsAuthenticated(true);
      localStorage.setItem("isAuthenticated", "true");
    }

    return isValid;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("isAuthenticated");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
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
