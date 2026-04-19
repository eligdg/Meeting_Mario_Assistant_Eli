import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

const LS_KEY = "mma_auto_creds_v1";

// Generate stable credentials for this browser. Stored locally so the same
// browser always logs into the same account. No UI is ever shown.
function getOrCreateCreds() {
  let raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.email && parsed?.password) return parsed as { email: string; password: string };
    } catch {
      /* ignore */
    }
  }
  const random = crypto.randomUUID();
  const creds = {
    email: `mario+${random.slice(0, 8)}@meeting-mario.local`,
    password: random,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(creds));
  return creds;
}

async function ensureSession() {
  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) return existing;

  const { email, password } = getOrCreateCreds();

  // Try sign in first (in case the user already exists)
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.data.session) return signIn.data.session;

  // Otherwise create the account
  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (signUp.data.session) return signUp.data.session;

  // Email confirmation may be on — try sign in again
  const retry = await supabase.auth.signInWithPassword({ email, password });
  return retry.data.session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    ensureSession()
      .then((s) => {
        setSession(s);
        setUser(s?.user ?? null);
      })
      .catch((err) => {
        console.error("Auto-login failed:", err);
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // No-op: the app uses a persistent local account. Clearing would lose data.
    // If you really want to reset, remove localStorage key 'mma_auto_creds_v1'.
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
