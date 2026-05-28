import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { KENYA_COUNTIES } from "@/data/kenyaLocations";
import { ArrowLeft, Building2, KeyRound, Leaf, MapPin, PackageSearch, Phone, Plus, ShieldCheck, SlidersHorizontal, User, X } from "lucide-react";

const BUSINESS_TYPES = ["Offtaker / Bulk Buyer","Processor","Hotel","School / Institution","Supermarket / Retailer","Exporter","Trader / Reseller","Other"];
const VARIETIES = ["Markies","Dutch Robijn","Challenger","Shangi","Unica","Sherekea","Asante"];
const FREQUENCIES = ["Daily","Weekly","Bi-weekly","Monthly","Custom"];
const CONTACT_METHODS = ["WhatsApp","Call","Email"];

type Location = { county: string; town: string };
type BuyerProfile = {
  buyer_name: string;
  phone_number: string;
  email: string;
  county: string;
  company_name: string;
  business_type: string;
  primary_county: string;
  primary_town: string;
  additional_locations: Location[];
  varieties_required: string[];
  varieties_other: string;
  quantity_per_order: string | number;
  quantity_unit: string;
  demand_frequency: string;
  demand_frequency_custom: string;
  quality_preference: string;
  quality_specifications: string;
  contact_full_name: string;
  contact_role: string;
  preferred_contact_methods: string[];
  additional_notes: string;
};

const defaultProfile: BuyerProfile = {
  buyer_name: "",
  phone_number: "",
  email: "",
  county: "",
  company_name: "",
  business_type: "",
  primary_county: "",
  primary_town: "",
  additional_locations: [],
  varieties_required: [],
  varieties_other: "",
  quantity_per_order: "",
  quantity_unit: "",
  demand_frequency: "",
  demand_frequency_custom: "",
  quality_preference: "",
  quality_specifications: "",
  contact_full_name: "",
  contact_role: "",
  preferred_contact_methods: [],
  additional_notes: "",
};

export default function BuyerSettings() {
  const session = getSession();
  const [loading, setLoading] = useState(true);
  const [pMsg, setPMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pSaving, setPSaving] = useState(false);
  const [profile, setProfile] = useState<BuyerProfile>(defaultProfile);

  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: response } = await supabase.functions.invoke("api-auth/buyer/profile/get", { body: { buyer_id: session.userId } });
      const data = response?.data as Partial<BuyerProfile> | undefined;
      if (data) setProfile((current) => ({
        ...current,
        ...data,
        additional_locations: Array.isArray(data.additional_locations) ? data.additional_locations : [],
        varieties_required: data.varieties_required ?? [],
        preferred_contact_methods: data.preferred_contact_methods ?? [],
        quantity_per_order: data.quantity_per_order ?? "",
      }));
      setLoading(false);
    })();
  }, [session]);

  if (!session || session.role !== "buyer") return <Navigate to="/login" replace />;

  const upd = <K extends keyof BuyerProfile>(k: K, v: BuyerProfile[K]) => setProfile((p) => ({ ...p, [k]: v }));
  const toggleArr = (k: "varieties_required" | "preferred_contact_methods", val: string) => {
    setProfile((p) => {
      const arr: string[] = p[k] || [];
      return { ...p, [k]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  };
  const addLoc = () => upd("additional_locations", [...(profile.additional_locations || []), { county: "", town: "" }]);
  const rmLoc = (i: number) => upd("additional_locations", profile.additional_locations.filter((_, idx) => idx !== i));
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

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <div className="container max-w-3xl py-8"><p className="text-muted-foreground">Loading...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container max-w-5xl py-6 md:py-8">
        <section className="overflow-hidden rounded-xl border border-emerald-900/10 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 px-5 py-6 text-white md:px-7">
            <Button asChild variant="outline" size="sm" className="mb-5 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <Link to="/buyer/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link>
            </Button>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50">
                  <User className="h-3.5 w-3.5 text-amber-300" />
                  Buyer profile
                </div>
                <h1 className="text-2xl font-bold tracking-normal text-white md:text-3xl">Profile & Settings</h1>
                <p className="mt-2 max-w-2xl text-sm text-emerald-50/85">
                  Keep company, procurement, location, and security details current for smoother bookings.
                </p>
              </div>
              <div className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm">
                <p className="font-semibold text-white">{profile.company_name || profile.buyer_name || "Buyer account"}</p>
                <p className="mt-1 text-emerald-50/80">{profile.contact_full_name || profile.email || "Profile contact"}</p>
              </div>
            </div>
          </div>
        </section>

      <form onSubmit={saveProfile} className="mt-6 space-y-5">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><Building2 className="h-5 w-5 text-primary" /> Company Information</CardTitle>
            <CardDescription>Core identity shown across procurement workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
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

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><MapPin className="h-5 w-5 text-primary" /> Locations</CardTitle>
            <CardDescription>Primary and additional delivery or buying locations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
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
                <div key={i} className="relative grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
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

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><PackageSearch className="h-5 w-5 text-primary" /> Product & Variety Requirements</CardTitle>
            <CardDescription>Help farmers understand what your buying team needs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Varieties Required</Label>
              <div className="flex flex-wrap gap-2">
                {VARIETIES.map(v => {
                  const active = (profile.varieties_required || []).includes(v);
                  return <Badge key={v} variant={active ? "default" : "outline"} className="cursor-pointer px-3 py-1.5 transition-colors hover:bg-emerald-50" onClick={() => toggleArr("varieties_required", v)}>{v}</Badge>;
                })}
              </div>
            </div>
            <div className="space-y-2"><Label>Other variety</Label><Input value={profile.varieties_other || ""} onChange={(e) => upd("varieties_other", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><SlidersHorizontal className="h-5 w-5 text-primary" /> Demand Profile</CardTitle>
            <CardDescription>Expected order size and buying rhythm.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
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

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><Leaf className="h-5 w-5 text-primary" /> Quality Preferences</CardTitle>
            <CardDescription>Capture quality expectations for smoother matching.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
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

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><Phone className="h-5 w-5 text-primary" /> Contact Person</CardTitle>
            <CardDescription>Who farmers and support teams should contact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
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
                  return <Badge key={m} variant={active ? "default" : "outline"} className="cursor-pointer px-3 py-1.5 transition-colors hover:bg-emerald-50" onClick={() => toggleArr("preferred_contact_methods", m)}>{m}</Badge>;
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><ShieldCheck className="h-5 w-5 text-primary" /> Additional Notes</CardTitle>
            <CardDescription>Optional context for your procurement profile.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Textarea rows={4} value={profile.additional_notes || ""} onChange={(e) => upd("additional_notes", e.target.value)} />
          </CardContent>
        </Card>

        <div className="sticky bottom-4 z-10 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {pMsg ? <p className={`text-sm ${pMsg.type === "ok" ? "text-green-700" : "text-red-600"}`}>{pMsg.text}</p> : <p className="text-sm text-muted-foreground">Save profile changes before leaving this page.</p>}
            <Button type="submit" disabled={pSaving} className="sm:w-auto">{pSaving ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      </form>

      <Card className="mt-6 border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><KeyRound className="h-5 w-5 text-primary" /> Change Password</CardTitle>
          <CardDescription>Update the password used to access this buyer account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 pt-6" onSubmit={changePassword}>
            <div className="space-y-2"><Label>Current Password</Label><Input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} required /></div>
            <div className="space-y-2"><Label>New Password</Label><Input type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} minLength={8} required /></div>
            <div className="space-y-2"><Label>Confirm New Password</Label><Input type="password" value={pw.confirm_password} onChange={(e) => setPw({ ...pw, confirm_password: e.target.value })} minLength={8} required /></div>
            {pwMsg && <p className={`text-sm ${pwMsg.type === "ok" ? "text-green-700" : "text-red-600"}`}>{pwMsg.text}</p>}
            <Button type="submit" disabled={pwSaving}>{pwSaving ? "Updating…" : "Update Password"}</Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
