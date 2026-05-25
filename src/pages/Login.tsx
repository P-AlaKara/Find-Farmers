import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getOAuthCallbackUrl, getSession, roleHome, saveSession, type AuthSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Chrome } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const session = getSession();
  if (session) return <Navigate to={roleHome(session.role)} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.functions.invoke<AuthSession & { error?: string }>("api-auth/login", {
      body: { email: normalizedEmail, password },
    });
    setLoading(false);

    if (error || data?.error || !data?.token || !data?.role || !data?.userId) {
      const friendlyMessage = data?.error || "Invalid email or password. Please try again.";
      setMessage(friendlyMessage);
      toast.error(friendlyMessage);
      return;
    }

    const sessionData: AuthSession = {
      token: data.token,
      role: data.role,
      userId: data.userId,
      email: data.email || normalizedEmail,
    };
    saveSession(sessionData);
    navigate(roleHome(sessionData.role), { replace: true });
  };

  const onGoogleSignIn = async () => {
    setMessage("");
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getOAuthCallbackUrl(),
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    setGoogleLoading(false);
    if (error) {
      const friendlyMessage = error.message || "Could not start Google sign-in. Please try again.";
      setMessage(friendlyMessage);
      toast.error(friendlyMessage);
    }
  };

  return (
    <div className="container max-w-lg min-h-[80vh] flex items-center justify-center py-12">
      <Card className="w-full shadow-lg">
        <CardHeader className="flex flex-col items-center space-y-3 pt-8">
          <img src="/logo.svg" alt="Farm Mall logo" className="h-16 w-16" />
          <CardTitle className="text-2xl text-center">Sign In</CardTitle>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
            {message && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>}
            <Button className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or</span></div>
            </div>
            <Button type="button" variant="outline" className="w-full" disabled={googleLoading} onClick={onGoogleSignIn}>
              <Chrome className="mr-2 h-4 w-4" />
              {googleLoading ? "Connecting..." : "Continue with Google"}
            </Button>
            <div className="text-sm space-y-1 text-center">
              <Link to="/register-farmer" className="underline block">Register as a farmer</Link>
              <Link to="/register-buyer" className="underline block">Register as a buyer</Link>
              <Link to="/setup-account" className="underline block">Complete account setup (existing invited buyers)</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
