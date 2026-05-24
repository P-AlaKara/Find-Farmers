import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSession, roleHome, saveSession, type AuthSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const session = getSession();
  if (session) return <Navigate to={roleHome(session.role)} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.functions.invoke<AuthSession & { error?: string }>("api-auth/login", {
      body: { email: normalizedEmail, password },
    });
    setLoading(false);

    if (error || data?.error || !data?.token || !data?.role || !data?.userId) {
      toast.error(data?.error || error?.message || "Unable to sign in. Please check your credentials.");
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
            <Button className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</Button>
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
