import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  api,
  clearSession,
  getStoredToken,
  getStoredUser,
  saveSession,
} from '../services/api';
import { User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (dni: string, password: string) => Promise<{ access_token: string; user: User }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<User | null>(() => {
    const storedToken = getStoredToken();
    if (!storedToken) return null;
    return getStoredUser();
  });

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  // Validar token real contra el backend al montar; si es inválido o expiró, limpiar sesión sin auto-login forzado
  useEffect(() => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setToken(null);
      setUser(null);
      return;
    }

    api
      .getAuthMe(currentToken)
      .then((profile) => {
        if (profile && (profile.role === 'BARBER' || profile.role === 'SUPERADMIN')) {
          saveSession(currentToken, profile);
          setToken(currentToken);
          setUser(profile);
        } else {
          logout();
        }
      })
      .catch(() => {
        logout();
      });
  }, [logout]);

  const login = useCallback(async (dni: string, password: string) => {
    const res = await api.login(dni, password);
    saveSession(res.access_token, res.user);
    setToken(res.access_token);
    setUser(res.user);
    return res;
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  }
  return ctx;
}
