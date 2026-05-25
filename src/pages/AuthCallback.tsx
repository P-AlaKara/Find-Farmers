import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getHashRouteUrl, roleHome, saveSession, type AuthSession } from "@/lib/auth";
import { toast } from "sonner";

const routeTo = (path: string) => {
  window.location.replace(getHashRouteUrl(path));
};

export default function AuthCallback() {
  const [message, setMessage] = useState("Finishing Google sign-in...");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const completeSignIn = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const oauthError = hashParams.get("error_description") || hashParams.get("error");
        if (oauthError) throw new Error(oauthError);

        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");
        if (hashAccessToken && hashRefreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });
          if (setSessionError) throw setSessionError;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Google sign-in did not return a valid session.");

        const { data, error: functionError } = await supabase.functions.invoke<AuthSession & { error?: string }>(
          "api-auth/oauth/google-session",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (functionError || data?.error || !data?.token || !data?.role || !data?.userId) {
          await supabase.auth.signOut();
          const friendlyMessage = data?.error || functionError?.message || "We could not match this Google account to a registered buyer or farmer.";
          throw new Error(friendlyMessage);
        }

        saveSession({
          token: data.token,
          role: data.role,
          userId: data.userId,
          email: data.email,
        });
        await supabase.auth.signOut({ scope: "local" });
        routeTo(roleHome(data.role));
      } catch (err) {
        const friendlyMessage = err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
        if (!mounted) return;
        setMessage("Google sign-in could not be completed.");
        setError(friendlyMessage);
        toast.error(friendlyMessage);
      }
    };

    completeSignIn();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="container max-w-lg min-h-[80vh] flex items-center justify-center py-12">
      <Card className="w-full shadow-lg">
        <CardHeader className="flex flex-col items-center space-y-3 pt-8">
          <img src="/logo.svg" alt="Farm Mall logo" className="h-16 w-16" />
          <CardTitle className="text-2xl text-center">{message}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-8 pb-8 text-center">
          {error ? (
            <>
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => routeTo("/register-farmer")}>Register as farmer</Button>
                <Button variant="outline" onClick={() => routeTo("/register-buyer")}>Register as buyer</Button>
              </div>
              <Button className="w-full" onClick={() => routeTo("/login")}>Back to login</Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Please wait while we verify your account.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
