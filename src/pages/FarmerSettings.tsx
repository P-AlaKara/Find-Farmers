import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { KENYA_COUNTIES, POTATO_VARIETIES } from "@/data/kenyaLocations";

type Profile = {
  full_name: string; phone_number: string; email: string;
  county: string; ward: string; specific_location: string;
  potato_variety: string; acreage_planted: number | string;
};

export default function FarmerSettings() {
  const session = getSession();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({ full_name: "", phone_number: "", email: "", county: "", ward: "", specific_location: "", potato_variety: "", acreage_planted: "" });
  const [pMsg, setPMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pSaving, setPSaving] = useState(false);

  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke("api-auth/farmer/profile/get", { body: { farmer_id: session.userId } });
      if (error || data?.error || !data?.data) {
        setLoadErr(data?.error || error?.message || "Could not load profile.");
      } else {
        const profileData = data.data;
        setProfile({
          full_name: profileData.full_name ?? "", phone_number: profileData.phone_number ?? "", email: profileData.email ?? "",
          county: profileData.county ?? "", ward: profileData.ward ?? "", specific_location: profileData.specific_location ?? "",
          potato_variety: profileData.potato_variety ?? "", acreage_planted: profileData.acreage_planted ?? "",
        });
      }
      setLoading(false);
    })();
  }, [session]);

  if (!session || session.role !== "farmer") return <Navigate to="/login" replace />;

  const wards = profile.county ? KENYA_COUNTIES[profile.county] ?? [] : [];

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setPMsg(null); setPSaving(true);
    const { data, error } = await supabase.functions.invoke("api-auth/farmer/profile", {
      body: {
        farmer_id: session.userId,
        full_name: profile.full_name, phone_number: profile.phone_number,
        county: profile.county, ward: profile.ward, specific_location: profile.specific_location,
        potato_variety: profile.potato_variety, acreage_planted: Number(profile.acreage_planted),
      },
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
    const { data, error } = await supabase.functions.invoke("api-auth/farmer/change-password", {
      body: { farmer_id: session.userId, current_password: pw.current_password, new_password: pw.new_password },
    });
    setPwSaving(false);
    if (error || data?.error) setPwMsg({ type: "err", text: data?.error || "Failed to update password" });
    else { setPwMsg({ type: "ok", text: "Password updated successfully." }); setPw({ current_password: "", new_password: "", confirm_password: "" }); }
  };

  if (loading) return <div className="container max-w-2xl py-8"><p className="text-muted-foreground">Loading…</p></div>;
  if (loadErr) return <div className="container max-w-2xl py-8"><p className="text-red-500">{loadErr}</p></div>;

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile & Settings</h1>
        <Button asChild variant="outline"><Link to="/farmer/dashboard">Back to Dashboard</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveProfile}>
            <div className="space-y-2"><Label>Full Name</Label><Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Phone Number</Label><Input value={profile.phone_number} onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Email</Label><Input value={profile.email} readOnly disabled /></div>
            <div className="space-y-2">
              <Label>County</Label>
              <Select value={profile.county} onValueChange={(v) => setProfile({ ...profile, county: v, ward: "" })}>
                <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                <SelectContent>{Object.keys(KENYA_COUNTIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ward</Label>
              <Select value={profile.ward} onValueChange={(v) => setProfile({ ...profile, ward: v })} disabled={!wards.length}>
                <SelectTrigger><SelectValue placeholder="Select ward" /></SelectTrigger>
                <SelectContent>{wards.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Specific Location</Label><Input value={profile.specific_location} onChange={(e) => setProfile({ ...profile, specific_location: e.target.value })} required /></div>
            <div className="space-y-2">
              <Label>Potato Variety</Label>
              <Select value={profile.potato_variety} onValueChange={(v) => setProfile({ ...profile, potato_variety: v })}>
                <SelectTrigger><SelectValue placeholder="Select variety" /></SelectTrigger>
                <SelectContent>{POTATO_VARIETIES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Acreage Planted</Label><Input type="number" min={0.1} step={0.1} value={profile.acreage_planted} onChange={(e) => setProfile({ ...profile, acreage_planted: e.target.value })} required /></div>
            {pMsg && <p className={`text-sm ${pMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{pMsg.text}</p>}
            <Button type="submit" disabled={pSaving}>{pSaving ? "Saving…" : "Save Changes"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={changePassword}>
            <div className="space-y-2"><Label>Current Password</Label><Input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required /></div>
            <div className="space-y-2"><Label>New Password</Label><Input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} minLength={8} required /></div>
            <div className="space-y-2"><Label>Confirm New Password</Label><Input type="password" value={pw.confirm_password} onChange={(e) => setPw({ ...pw, confirm_password: e.target.value })} minLength={8} required /></div>
            {pwMsg && <p className={`text-sm ${pwMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{pwMsg.text}</p>}
            <Button type="submit" disabled={pwSaving}>{pwSaving ? "Updating…" : "Update Password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
