import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSession, saveSession } from "@/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const session = getSession();
  if (session) return <Navigate to={session.role === "admin" ? "/admin/dashboard" : session.role === "farmer" ? "/farmer/dashboard" : "/marketplace"} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const { data, error } = await supabase.functions.invoke("api-auth/login", { body: { email, password } });
    if (error || !data?.token) return setError(data?.error || "Invalid email or password");
    saveSession(data);
    navigate(data.role === "admin" ? "/admin/dashboard" : data.role === "farmer" ? "/farmer/dashboard" : "/marketplace");
  };

  return (
    <div className="container max-w-md py-12">
      <Card className="shadow-lg">
        <CardHeader className="flex flex-col items-center space-y-4 pt-8">
          <img src="/logo.svg" alt="Farm Mall logo" className="h-32 w-32" />
          <CardTitle className="text-2xl text-center">Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input type="email" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full">Sign In</Button>
            <div className="text-sm space-y-1 text-center">
              <Link to="/register-farmer" className="underline block">Register as a farmer</Link>
              <Link to="/setup-account" className="underline block">Complete account setup</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
