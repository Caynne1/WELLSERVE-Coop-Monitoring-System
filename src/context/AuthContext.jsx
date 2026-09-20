import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { trackActivity } from '../services/logService';
import SessionTimeoutDialog from '../components/shared/SessionTimeoutDialog';

const AuthContext = createContext(null);
const LOGIN_LOGGED_USER_KEY = 'wellserve:activity-login-logged-user';
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;
const TIMEOUT_WARNING_MS = 2 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [timeoutWarningOpen, setTimeoutWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(TIMEOUT_WARNING_MS / 1000);
  const loggedLoginUserRef = useRef(null);
  const validatedUserIdRef = useRef(null);
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const timeoutDeadlineRef = useRef(null);
  const warningVisibleRef = useRef(false);
  const signOutInProgressRef = useRef(false);

  const fetchAndValidateProfile = useCallback(async (authUser) => {
    if (!authUser) {
      validatedUserIdRef.current = null;
      setProfile(null);
      setMfaVerified(false);
      return;
    }

    try {
      console.log('[AuthContext] fetching profile for:', authUser.id);

      // Timeout wrapper so profile fetch can never freeze the app
      const profilePromise = supabase
        .from('profiles')
        .select('id, full_name, email, role, status, permissions, position_title')
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
        setUser(null);
        setSession(null);
        await supabase.auth.signOut({ scope: 'local' });
        return false;
      }

      if (!data) {
        console.warn('[AuthContext] No profile found; denying access');
        setProfile(null);
        setUser(null);
        setSession(null);
        await supabase.auth.signOut({ scope: 'local' });
        return false;
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
        return false;
      }

      setProfile(data);
      validatedUserIdRef.current = authUser.id;
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setMfaVerified(!assuranceError && assurance?.currentLevel === 'aal2');
      return true;
    } catch (err) {
      console.error('[AuthContext] unexpected profile error:', err);
      setProfile(null);
      setUser(null);
      setSession(null);
      await supabase.auth.signOut({ scope: 'local' });
      return false;
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

        await fetchAndValidateProfile(currentSession?.user ?? null);
        if (mounted) setLoading(false);
      } catch (err) {
        console.error('[AuthContext] bootstrap error:', err);
        if (mounted) setLoading(false);
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      console.log('[AuthContext] auth state changed:', _event);

      const nextUserId = nextSession?.user?.id ?? null;
      const alreadyValidated = !!nextUserId && validatedUserIdRef.current === nextUserId;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if ((_event === 'TOKEN_REFRESHED' || _event === 'SIGNED_IN') && alreadyValidated) {
        setLoading(false);
      } else {
        setLoading(!!nextSession?.user);

        // Defer database work until the auth callback releases Supabase's auth lock.
        setTimeout(async () => {
          await fetchAndValidateProfile(nextSession?.user ?? null);
          if (mounted) setLoading(false);
        }, 0);
      }

      if (_event === 'SIGNED_OUT') {
        validatedUserIdRef.current = null;
        loggedLoginUserRef.current = null;
        sessionStorage.removeItem(LOGIN_LOGGED_USER_KEY);
      }

      if (_event === 'SIGNED_IN' && nextSession?.user?.id) {
        const loggedUserId = sessionStorage.getItem(LOGIN_LOGGED_USER_KEY);
        if (loggedLoginUserRef.current === nextSession.user.id || loggedUserId === nextSession.user.id) {
          return;
        }

        loggedLoginUserRef.current = nextSession.user.id;
        sessionStorage.setItem(LOGIN_LOGGED_USER_KEY, nextSession.user.id);

        trackActivity({
          userId: nextSession.user.id,
          module: 'auth',
          action: 'login',
          description: 'User signed in.',
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAndValidateProfile]);

  const clearSessionTimers = useCallback(() => {
    window.clearTimeout(warningTimerRef.current);
    window.clearTimeout(logoutTimerRef.current);
    warningTimerRef.current = null;
    logoutTimerRef.current = null;
    timeoutDeadlineRef.current = null;
  }, []);

  const signOut = useCallback(async (options = {}) => {
    if (signOutInProgressRef.current) return;

    const reason = options?.reason === 'inactivity' ? 'inactivity' : 'manual';
    signOutInProgressRef.current = true;
    clearSessionTimers();
    warningVisibleRef.current = false;
    setTimeoutWarningOpen(false);
    setLoggingOut(true);
    if (user?.id) {
      trackActivity({
        userId: user.id,
        module: 'auth',
        action: 'logout',
        description: reason === 'inactivity'
          ? 'User was signed out after 15 minutes of inactivity.'
          : 'User signed out.',
      });
    }
    loggedLoginUserRef.current = null;
    sessionStorage.removeItem(LOGIN_LOGGED_USER_KEY);
    // Let the logout animation play briefly before the auth state actually
    // flips and the router kicks the user back to /login.
    try {
      await new Promise(resolve => setTimeout(resolve, 1100));
      await supabase.auth.signOut();
    } finally {
      setLoggingOut(false);
      signOutInProgressRef.current = false;
    }
  }, [clearSessionTimers, user?.id]);

  const expireSession = useCallback(async () => {
    if (signOutInProgressRef.current) return;
    warningVisibleRef.current = false;
    setTimeoutWarningOpen(false);
    await signOut({ reason: 'inactivity' });
  }, [signOut]);

  const armSessionTimeout = useCallback(() => {
    clearSessionTimers();
    warningVisibleRef.current = false;
    setTimeoutWarningOpen(false);
    setRemainingSeconds(TIMEOUT_WARNING_MS / 1000);
    timeoutDeadlineRef.current = Date.now() + INACTIVITY_LIMIT_MS;

    warningTimerRef.current = window.setTimeout(() => {
      warningVisibleRef.current = true;
      setTimeoutWarningOpen(true);
    }, INACTIVITY_LIMIT_MS - TIMEOUT_WARNING_MS);

    logoutTimerRef.current = window.setTimeout(expireSession, INACTIVITY_LIMIT_MS);
  }, [clearSessionTimers, expireSession]);

  useEffect(() => {
    if (!user?.id) {
      clearSessionTimers();
      warningVisibleRef.current = false;
      setTimeoutWarningOpen(false);
      return undefined;
    }

    const handleActivity = () => {
      if (!warningVisibleRef.current && !signOutInProgressRef.current) {
        armSessionTimeout();
      }
    };

    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    armSessionTimeout();

    return () => {
      activityEvents.forEach(eventName => window.removeEventListener(eventName, handleActivity));
      clearSessionTimers();
    };
  }, [armSessionTimeout, clearSessionTimers, expireSession, user?.id]);

  useEffect(() => {
    if (!timeoutWarningOpen) return undefined;

    const updateCountdown = () => {
      const millisecondsLeft = Math.max(0, (timeoutDeadlineRef.current || Date.now()) - Date.now());
      setRemainingSeconds(Math.ceil(millisecondsLeft / 1000));
    };

    updateCountdown();
    const countdownTimer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(countdownTimer);
  }, [timeoutWarningOpen]);

  const stayLoggedIn = useCallback(() => {
    if (user?.id) armSessionTimeout();
  }, [armSessionTimeout, user?.id]);

  const isAdmin = profile?.role === 'admin';

  // hasPermission('loans', 'view') → true/false
  // Admins always have full access regardless of permissions object
  function hasPermission(module, action = 'view') {
    if (!profile) return false;
    if (isAdmin) return true;
    return !!profile.permissions?.[module]?.[action];
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        accountSetupRequired: profile?.status === 'invited',
        mfaRequired: !!profile,
        mfaVerified,
        isAdmin,
        loading,
        loggingOut,
        signOut,
        hasPermission,
      }}
    >
      {children}
      <SessionTimeoutDialog
        open={timeoutWarningOpen}
        remainingSeconds={remainingSeconds}
        onContinue={stayLoggedIn}
        onLogout={signOut}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
