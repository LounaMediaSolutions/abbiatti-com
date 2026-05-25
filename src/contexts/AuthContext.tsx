import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearPostLoginRedirect } from "@/lib/authRedirect";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const applySession = (nextSession: Session | null, source: string) => {
      if (!isMounted) return;
      console.log("[AuthContext] applySession", {
        source,
        hasSession: !!nextSession,
        userId: nextSession?.user?.id ?? null,
        email: nextSession?.user?.email ?? null,
        expiresAt: nextSession?.expires_at ?? null,
      });
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("[AuthContext] onAuthStateChange event:", event);
      applySession(newSession, `onAuthStateChange:${event}`);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: existing }, error }) => {
        if (error) console.error("[AuthContext] getSession error:", error);
        applySession(existing, "getSession");
      })
      .catch((err) => {
        console.error("[AuthContext] getSession threw:", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    clearPostLoginRedirect();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
