import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { KENYA_COUNTIES } from "@/data/kenyaLocations";

export default function BuyerSettings() {
  const session = getSession();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ buyer_name: "", phone_number: "", email: "", county: "" });
  const [pMsg, setPMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pSaving, setPSaving] = useState(false);

  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase.from("buyers").select("buyer_name, phone_number, email, county").eq("id", session.userId).maybeSingle();
      if (data) setProfile({ buyer_name: data.buyer_name ?? "", phone_number: data.phone_number ?? "", email: data.email ?? "", county: data.county ?? "" });
      setLoading(false);
    })();
  }, [session]);

  if (!session || session.role !== "buyer") return <Navigate to="/login" replace />;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setPMsg(null);
    setPSaving(true);
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/profile", {
      body: { buyer_id: session.userId, buyer_name: profile.buyer_name, phone_number: profile.phone_number, county: profile.county },
    });
    setPSaving(false);
    if (error || data?.error) setPMsg({ type: "err", text: data?.error || "Failed to save changes" });
    else setPMsg({ type: "ok", text: "Profile updated successfully." });
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.new_password !== pw.confirm_password) return setPwMsg({ type: "err", text: "New passwords do not match." });
    if (pw.new_password.length < 8) return setPwMsg({ type: "err", text: "New password must be at least 8 characters." });
    setPwSaving(true);
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/change-password", {
      body: { buyer_id: session.userId, current_password: pw.current_password, new_password: pw.new_password },
    });
    setPwSaving(false);
    if (error || data?.error) setPwMsg({ type: "err", text: data?.error || "Failed to update password" });
    else { setPwMsg({ type: "ok", text: "Password updated successfully." }); setPw({ current_password: "", new_password: "", confirm_password: "" }); }
  };

  if (loading) return <div className="container max-w-2xl py-8"><p className="text-muted-foreground">Loading…</p></div>;

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <h1 className="text-2xl font-bold">Profile & Settings</h1>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveProfile}>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={profile.buyer_name} onChange={(e) => setProfile({ ...profile, buyer_name: e.target.value })} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={profile.phone_number} onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })} maxLength={20} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile.email} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>County</Label>
              <Select value={profile.county} onValueChange={(v) => setProfile({ ...profile, county: v })}>
                <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                <SelectContent>{Object.keys(KENYA_COUNTIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {pMsg && <p className={`text-sm ${pMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{pMsg.text}</p>}
            <Button type="submit" disabled={pSaving}>{pSaving ? "Saving…" : "Save Changes"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={changePassword}>
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" value={pw.confirm_password} onChange={(e) => setPw({ ...pw, confirm_password: e.target.value })} minLength={8} required />
            </div>
            {pwMsg && <p className={`text-sm ${pwMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{pwMsg.text}</p>}
            <Button type="submit" disabled={pwSaving}>{pwSaving ? "Updating…" : "Update Password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
