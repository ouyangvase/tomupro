import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, AppRole } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  roleChanged: boolean;
  dismissRoleChange: () => void;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string, role: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleChanged, setRoleChanged] = useState(false);
  const [previousRole, setPreviousRole] = useState<AppRole | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (!error && data) {
      const newProfile = data as Profile;
      
      // Check if role changed while session is active
      if (previousRole && previousRole !== newProfile.role) {
        setRoleChanged(true);
      }
      
      setPreviousRole(newProfile.role);
      setProfile(newProfile);
    }
  }, [previousRole]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const dismissRoleChange = useCallback(() => {
    setRoleChanged(false);
    // Force reload to apply new permissions
    window.location.reload();
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setPreviousRole(null);
          setRoleChanged(false);
        }
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Subscribe to realtime changes on the profile
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newProfile = payload.new as Profile;
          
          // Check if role changed
          if (profile && profile.role !== newProfile.role) {
            setRoleChanged(true);
          }
          
          setProfile(newProfile);
          setPreviousRole(newProfile.role);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName: string, role: AppRole) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
          role: role,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPreviousRole(null);
    setRoleChanged(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role: profile?.role ?? null,
        loading,
        roleChanged,
        dismissRoleChange,
        refreshProfile,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
