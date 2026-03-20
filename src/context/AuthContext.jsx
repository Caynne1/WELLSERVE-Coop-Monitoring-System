import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAndValidateProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setProfile(null);
      return;
    }

    try {
      console.log('[AuthContext] fetching profile for:', authUser.id);

      // Timeout wrapper so profile fetch can never freeze the app
      const profilePromise = supabase
        .from('profiles')
        .select('id, full_name, email, role, status')
        .eq('id', authUser.id)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timed out')), 5000)
      );

      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);

      console.log('[AuthContext] profile query result:', { data, error });

      if (error) {
        console.warn('[AuthContext] profile fetch error:', error.message);
        setProfile(null);
        return;
      }

      if (!data) {
        console.warn('[AuthContext] No profile found, continuing without blocking UI');
        setProfile(null);
        return;
      }

      console.log('[AuthContext] profile loaded:', data);

      if (data.status === 'inactive') {
        toast.error(
          'Your account is inactive. Please contact the administrator.',
          { duration: 6000 }
        );

        setProfile(null);
        setUser(null);
        setSession(null);
        await supabase.auth.signOut();
        return;
      }

      setProfile(data);
    } catch (err) {
      console.error('[AuthContext] unexpected profile error:', err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        console.log('[AuthContext] bootstrapping session...');
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[AuthContext] getSession error:', error.message);
        }

        const currentSession = data?.session ?? null;

        if (!mounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // IMPORTANT: stop blocking the whole app here
        setLoading(false);

        // Fetch profile in background
        fetchAndValidateProfile(currentSession?.user ?? null);
      } catch (err) {
        console.error('[AuthContext] bootstrap error:', err);
        if (mounted) setLoading(false);
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      console.log('[AuthContext] auth state changed:', _event);

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      // IMPORTANT: do not block UI during profile fetch
      setLoading(false);

      fetchAndValidateProfile(nextSession?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAndValidateProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}