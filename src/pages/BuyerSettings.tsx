import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { KENYA_COUNTIES } from "@/data/kenyaLocations";
import { Plus, X } from "lucide-react";

const BUSINESS_TYPES = ["Offtaker / Bulk Buyer","Processor","Hotel","School / Institution","Supermarket / Retailer","Exporter","Trader / Reseller","Other"];
const VARIETIES = ["Markies","Dutch Robijn","Challenger","Shangi","Unica","Sherekea","Asante"];
const FREQUENCIES = ["Daily","Weekly","Bi-weekly","Monthly","Custom"];
const CONTACT_METHODS = ["WhatsApp","Call","Email"];

type Location = { county: string; town: string };

export default function BuyerSettings() {
  const session = getSession();
  const [loading, setLoading] = useState(true);
  const [pMsg, setPMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pSaving, setPSaving] = useState(false);
  const [profile, setProfile] = useState<any>({
    buyer_name: "", phone_number: "", email: "", county: "",
    company_name: "", business_type: "",
    primary_county: "", primary_town: "", additional_locations: [] as Location[],
    varieties_required: [] as string[], varieties_other: "",
    quantity_per_order: "", quantity_unit: "", demand_frequency: "", demand_frequency_custom: "",
    quality_preference: "", quality_specifications: "",
    contact_full_name: "", contact_role: "", preferred_contact_methods: [] as string[],
    additional_notes: "",
  });

  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: response } = await supabase.functions.invoke("api-auth/buyer/profile/get", { body: { buyer_id: session.userId } });
      const data = response?.data;
      if (data) setProfile({
        ...profile, ...data,
        additional_locations: Array.isArray(data.additional_locations) ? data.additional_locations : [],
        varieties_required: data.varieties_required ?? [],
        preferred_contact_methods: data.preferred_contact_methods ?? [],
        quantity_per_order: data.quantity_per_order ?? "",
      });
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session || session.role !== "buyer") return <Navigate to="/login" replace />;

  const upd = (k: string, v: any) => setProfile((p: any) => ({ ...p, [k]: v }));
  const toggleArr = (k: "varieties_required" | "preferred_contact_methods", val: string) => {
    setProfile((p: any) => {
      const arr: string[] = p[k] || [];
      return { ...p, [k]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };
  const addLoc = () => upd("additional_locations", [...(profile.additional_locations || []), { county: "", town: "" }]);
  const rmLoc = (i: number) => upd("additional_locations", profile.additional_locations.filter((_: any, idx: number) => idx !== i));
  const updLoc = (i: number, field: keyof Location, value: string) =>
    upd("additional_locations", profile.additional_locations.map((l: Location, idx: number) => idx === i ? { ...l, [field]: value } : l));

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setPMsg(null);
    setPSaving(true);
    const payload = {
      buyer_id: session.userId,
      buyer_name: profile.company_name || profile.buyer_name,
      phone_number: profile.phone_number,
      county: profile.primary_county || profile.county,
      company_name: profile.company_name,
      business_type: profile.business_type,
      primary_county: profile.primary_county,
      primary_town: profile.primary_town,
      additional_locations: profile.additional_locations,
      varieties_required: profile.varieties_required,
      varieties_other: profile.varieties_other || null,
      quantity_per_order: profile.quantity_per_order ? Number(profile.quantity_per_order) : null,
      quantity_unit: profile.quantity_unit || null,
      demand_frequency: profile.demand_frequency || null,
      demand_frequency_custom: profile.demand_frequency === "Custom" ? profile.demand_frequency_custom : null,
      quality_preference: profile.quality_preference || null,
      quality_specifications: profile.quality_preference === "Custom" ? profile.quality_specifications : null,
      contact_full_name: profile.contact_full_name,
      contact_role: profile.contact_role,
      preferred_contact_methods: profile.preferred_contact_methods,
      additional_notes: profile.additional_notes || null,
    };
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/profile", { body: payload });
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
    <div className="container max-w-3xl py-8 space-y-6">
      <h1 className="text-2xl font-bold">Profile & Settings</h1>

      <form onSubmit={saveProfile} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Company Name</Label><Input value={profile.company_name || ""} onChange={(e) => upd("company_name", e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Business Type</Label>
                <Select value={profile.business_type || ""} onValueChange={(v) => upd("business_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                  <SelectContent>{BUSINESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input value={profile.email} readOnly disabled /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Locations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Primary County</Label>
                <Select value={profile.primary_county || ""} onValueChange={(v) => upd("primary_county", v)}>
                  <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                  <SelectContent>{Object.keys(KENYA_COUNTIES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Town / Area</Label><Input value={profile.primary_town || ""} onChange={(e) => upd("primary_town", e.target.value)} placeholder="e.g. Industrial Area" /></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Additional Locations</Label>
                <Button type="button" size="sm" variant="outline" onClick={addLoc}><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </div>
              {(profile.additional_locations || []).map((loc: Location, i: number) => (
                <div key={i} className="rounded-lg border p-3 relative grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => rmLoc(i)} className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  <Select value={loc.county} onValueChange={(v) => updLoc(i, "county", v)}>
                    <SelectTrigger><SelectValue placeholder="County" /></SelectTrigger>
                    <SelectContent>{Object.keys(KENYA_COUNTIES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={loc.town} onChange={(e) => updLoc(i, "town", e.target.value)} placeholder="Town / Area" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Product & Variety Requirements</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Varieties Required</Label>
              <div className="flex flex-wrap gap-2">
                {VARIETIES.map(v => {
                  const active = (profile.varieties_required || []).includes(v);
                  return <Badge key={v} variant={active ? "default" : "outline"} className="cursor-pointer px-3 py-1.5" onClick={() => toggleArr("varieties_required", v)}>{v}</Badge>;
                })}
              </div>
            </div>
            <div className="space-y-2"><Label>Other variety</Label><Input value={profile.varieties_other || ""} onChange={(e) => upd("varieties_other", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Demand Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="space-y-2"><Label>Quantity per Order</Label><Input type="number" min="0" step="0.1" value={profile.quantity_per_order || ""} onChange={(e) => upd("quantity_per_order", e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={profile.quantity_unit || ""} onValueChange={(v) => upd("quantity_unit", v)}>
                  <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                  <SelectContent><SelectItem value="Kg">Kg</SelectItem><SelectItem value="Tons">Tons</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={profile.demand_frequency || ""} onValueChange={(v) => upd("demand_frequency", v)}>
                <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {profile.demand_frequency === "Custom" && (
              <div className="space-y-2"><Label>Describe frequency</Label><Input value={profile.demand_frequency_custom || ""} onChange={(e) => upd("demand_frequency_custom", e.target.value)} placeholder="Every 2–3 days" /></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quality Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Quality Preference</Label>
              <Select value={profile.quality_preference || ""} onValueChange={(v) => upd("quality_preference", v)}>
                <SelectTrigger><SelectValue placeholder="Select preference" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Flexible">Flexible / Any</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {profile.quality_preference === "Custom" && (
              <div className="space-y-2"><Label>Specifications</Label><Textarea rows={4} value={profile.quality_specifications || ""} onChange={(e) => upd("quality_specifications", e.target.value)} /></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contact Person</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Full Name</Label><Input value={profile.contact_full_name || ""} onChange={(e) => upd("contact_full_name", e.target.value)} /></div>
              <div className="space-y-2"><Label>Role</Label><Input value={profile.contact_role || ""} onChange={(e) => upd("contact_role", e.target.value)} placeholder="e.g. Procurement Manager" /></div>
              <div className="space-y-2"><Label>Phone Number</Label><Input value={profile.phone_number || ""} onChange={(e) => upd("phone_number", e.target.value)} /></div>
            </div>
            <div className="space-y-2">
              <Label>Preferred Contact Methods</Label>
              <div className="flex flex-wrap gap-2">
                {CONTACT_METHODS.map(m => {
                  const active = (profile.preferred_contact_methods || []).includes(m);
                  return <Badge key={m} variant={active ? "default" : "outline"} className="cursor-pointer px-3 py-1.5" onClick={() => toggleArr("preferred_contact_methods", m)}>{m}</Badge>;
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Additional Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={4} value={profile.additional_notes || ""} onChange={(e) => upd("additional_notes", e.target.value)} />
          </CardContent>
        </Card>

        {pMsg && <p className={`text-sm ${pMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{pMsg.text}</p>}
        <Button type="submit" disabled={pSaving}>{pSaving ? "Saving…" : "Save Changes"}</Button>
      </form>

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
