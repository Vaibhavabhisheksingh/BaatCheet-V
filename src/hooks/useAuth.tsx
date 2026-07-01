import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  username: string;
  bio: string | null;
  profile_image: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    username: string,
    bio?: string,
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (
    updates: Partial<Profile>,
  ) => Promise<{ error: Error | null }>;
  uploadAvatar: (
    file: File,
  ) => Promise<{ url: string | null; error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
    return data as Profile | null;
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id).then(setProfile);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id).then((p) => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    username: string,
    bio?: string,
  ) => {
    // Pre-validate username before creating auth user to avoid orphaned accounts
    const lower = username.trim().toLowerCase();
    if (lower.startsWith("admin") && lower !== "baatcheet") {
      return {
        error: new Error('Usernames starting with "admin" are reserved.'),
      };
    }

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) {
      return { error: new Error("This username is already taken") };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { pending_username: username, pending_bio: bio || null },
      },
    });
    console.log("Signup data:", data);
    console.log("Signup error:", error);

    if (error) return { error };

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: data.user.id,
        email,
        username,
        bio: bio || null,
      });
      if (profileError) {
        await supabase.auth.signOut();
        return { error: profileError };
      }
      if (data.session) {
        const newProfile = await fetchProfile(data.user.id);
        setProfile(newProfile);
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error };

    // Block sign-in for blocked accounts
    const {
      data: { user: signedInUser },
    } = await supabase.auth.getUser();
    if (signedInUser) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_blocked")
        .eq("user_id", signedInUser.id)
        .maybeSingle();
      if (prof?.is_blocked) {
        await supabase.auth.signOut();
        return {
          error: new Error(
            "Your account has been blocked by an administrator.",
          ),
        };
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error("Not authenticated") };

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (!error) {
      const newProfile = await fetchProfile(user.id);
      setProfile(newProfile);
    }

    return { error };
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return { url: null, error: new Error("Not authenticated") };

    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return { url: null, error: uploadError };
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

    await updateProfile({ profile_image: data.publicUrl });

    return { url: data.publicUrl, error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        uploadAvatar,
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
