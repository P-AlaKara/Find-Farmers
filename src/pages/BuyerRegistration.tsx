import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { KENYA_COUNTIES } from "@/data/kenyaLocations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DRAFT_KEY = "buyer_registration_draft_v2";

const BUSINESS_TYPES = [
  "Offtaker / Bulk Buyer",
  "Processor",
  "Hotel",
  "School / Institution",
  "Supermarket / Retailer",
  "Exporter",
  "Trader / Reseller",
  "Other",
];

const VARIETIES = ["Markies", "Dutch Robijn", "Challenger", "Shangi", "Unica", "Sherekea", "Asante"];
const FREQUENCIES = ["Daily", "Weekly", "Bi-weekly", "Monthly", "Custom"];
const CONTACT_METHODS = ["WhatsApp", "Call", "Email"];

type Location = { county: string; town: string };

type FormState = {
  // Step 1
  email: string;
  password: string;
  confirm_password: string;
  company_name: string;
  business_type: string;
  // Step 2
  primary_county: string;
  primary_town: string;
  additional_locations: Location[];
  // Step 3
  varieties_required: string[];
  varieties_other: string;
  // Step 4
  quantity_per_order: string;
  quantity_unit: "Kg" | "Tons" | "";
  demand_frequency: string;
  demand_frequency_custom: string;
  // Step 5
  quality_preference: "" | "Flexible" | "Custom";
  quality_specifications: string;
  // Step 6
  contact_full_name: string;
  contact_role: string;
  phone_number: string;
  contact_email: string;
  preferred_contact_methods: string[];
  // Step 7
  additional_notes: string;
};

const empty: FormState = {
  email: "", password: "", confirm_password: "",
  company_name: "", business_type: "",
  primary_county: "", primary_town: "", additional_locations: [],
  varieties_required: [], varieties_other: "",
  quantity_per_order: "", quantity_unit: "", demand_frequency: "", demand_frequency_custom: "",
  quality_preference: "", quality_specifications: "",
  contact_full_name: "", contact_role: "", phone_number: "", contact_email: "", preferred_contact_methods: [],
  additional_notes: "",
};

const STEPS = [
  "Account & Company",
  "Locations",
  "Varieties",
  "Demand",
  "Quality",
  "Contact",
  "Notes",
];

export default function BuyerRegistration() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Restore draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setForm({ ...empty, ...saved.form });
        setStep(typeof saved.step === "number" ? saved.step : 0);
      }
    } catch {}
  }, []);

  // Persist draft
  useEffect(() => {
    if (success) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step }));
  }, [form, step, success]);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const toggleArr = (key: "varieties_required" | "preferred_contact_methods", val: string) => {
    setForm((p) => {
      const arr = p[key];
      return { ...p, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
    });
  };

  const addLocation = () => upd("additional_locations", [...form.additional_locations, { county: "", town: "" }]);
  const removeLocation = (i: number) => upd("additional_locations", form.additional_locations.filter((_, idx) => idx !== i));
  const updateLocation = (i: number, field: keyof Location, value: string) =>
    upd("additional_locations", form.additional_locations.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!form.email.trim() || !EMAIL_RE.test(form.email.trim())) e.email = "Valid email is required";
      if (form.password.length < 8) e.password = "Password must be at least 8 characters";
      if (form.password !== form.confirm_password) e.confirm_password = "Passwords do not match";
      if (!form.company_name.trim()) e.company_name = "Company name is required";
      if (!form.business_type) e.business_type = "Select a business type";
    }
    if (s === 1) {
      if (!form.primary_county) e.primary_county = "Primary county is required";
      if (!form.primary_town.trim()) e.primary_town = "Town/Area is required";
      form.additional_locations.forEach((l, i) => {
        if (!l.county) e[`add_county_${i}`] = "Required";
        if (!l.town.trim()) e[`add_town_${i}`] = "Required";
      });
    }
    if (s === 2) {
      if (form.varieties_required.length === 0 && !form.varieties_other.trim()) e.varieties_required = "Select at least one variety";
    }
    if (s === 3) {
      const q = parseFloat(form.quantity_per_order);
      if (!form.quantity_per_order || isNaN(q) || q <= 0) e.quantity_per_order = "Enter a valid quantity";
      if (!form.quantity_unit) e.quantity_unit = "Select unit";
      if (!form.demand_frequency) e.demand_frequency = "Select frequency";
      if (form.demand_frequency === "Custom" && !form.demand_frequency_custom.trim()) e.demand_frequency_custom = "Describe your frequency";
    }
    if (s === 4) {
      if (!form.quality_preference) e.quality_preference = "Select a preference";
      if (form.quality_preference === "Custom" && !form.quality_specifications.trim()) e.quality_specifications = "Describe your specifications";
    }
    if (s === 5) {
      if (!form.contact_full_name.trim()) e.contact_full_name = "Full name is required";
      if (!form.contact_role.trim()) e.contact_role = "Role is required";
      if (!form.phone_number.trim()) e.phone_number = "Phone is required";
      if (!form.contact_email.trim() || !EMAIL_RE.test(form.contact_email.trim())) e.contact_email = "Valid email is required";
      if (form.preferred_contact_methods.length === 0) e.preferred_contact_methods = "Select at least one method";
    }
    return e;
  };

  const next = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
    else toast.error("Please fix the highlighted fields");
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  const submit = async () => {
    // Validate all steps
    for (let s = 0; s <= STEPS.length - 1; s++) {
      const e = validateStep(s);
      if (Object.keys(e).length > 0) {
        setErrors(e);
        setStep(s);
        toast.error("Please complete all required fields");
        return;
      }
    }
    setSubmitting(true);
    const payload = {
      // Legacy/core fields
      buyer_name: form.company_name.trim(),
      phone_number: form.phone_number.trim(),
      email: form.email.trim().toLowerCase(),
      county: form.primary_county,
      password: form.password,
      confirm_password: form.confirm_password,
      // New profile fields
      company_name: form.company_name.trim(),
      business_type: form.business_type,
      primary_county: form.primary_county,
      primary_town: form.primary_town.trim(),
      additional_locations: form.additional_locations,
      varieties_required: form.varieties_required,
      varieties_other: form.varieties_other.trim() || null,
      quantity_per_order: parseFloat(form.quantity_per_order),
      quantity_unit: form.quantity_unit,
      demand_frequency: form.demand_frequency,
      demand_frequency_custom: form.demand_frequency === "Custom" ? form.demand_frequency_custom.trim() : null,
      quality_preference: form.quality_preference,
      quality_specifications: form.quality_preference === "Custom" ? form.quality_specifications.trim() : null,
      contact_full_name: form.contact_full_name.trim(),
      contact_role: form.contact_role.trim(),
      preferred_contact_methods: form.preferred_contact_methods,
      contact_email: form.contact_email.trim().toLowerCase(),
      additional_notes: form.additional_notes.trim() || null,
    };
    const { data, error } = await supabase.functions.invoke("api-auth/register-buyer", { body: payload });
    setSubmitting(false);
    if (error || !data?.ok) {
      toast.error(data?.error || "Failed to create buyer account.");
      return;
    }
    localStorage.removeItem(DRAFT_KEY);
    setSuccess(true);
  };

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  if (success) {
    return (
      <div className="container max-w-lg min-h-[80vh] flex items-center justify-center py-12">
        <Card className="w-full shadow-lg text-center">
          <CardContent className="py-12 space-y-6">
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Buyer Profile Submitted Successfully</h1>
              <p className="text-muted-foreground mt-2">You can now sign in to manage your account and start booking farms.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => navigate("/login", { state: { message: "Your buyer account is ready. Please sign in." } })}>
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => { setSuccess(false); setStep(0); }}>Edit Profile</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pb-4 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0 mb-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Step {step + 1} of {STEPS.length}: <span className="text-primary">{STEPS[step]}</span></p>
          <p className="text-xs text-muted-foreground">{Math.round(progress)}%</p>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Register as Buyer</CardTitle>
          <CardDescription>Create your buyer profile to start booking potato farms.</CardDescription>
        </CardHeader>
        <CardContent>
          <div key={step} className="animate-in fade-in duration-300 space-y-5">
            {step === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Company Name *</Label>
                    <Input value={form.company_name} onChange={(e) => upd("company_name", e.target.value)} />
                    {errors.company_name && <p className="text-xs text-destructive">{errors.company_name}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Business Type *</Label>
                  <Select value={form.business_type} onValueChange={(v) => upd("business_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
                    <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.business_type && <p className="text-xs text-destructive">{errors.business_type}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Password *</Label>
                    <Input type="password" value={form.password} onChange={(e) => upd("password", e.target.value)} />
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm Password *</Label>
                    <Input type="password" value={form.confirm_password} onChange={(e) => upd("confirm_password", e.target.value)} />
                    {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password}</p>}
                  </div>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-sm font-medium">Primary Location</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>County *</Label>
                      <Select value={form.primary_county} onValueChange={(v) => upd("primary_county", v)}>
                        <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                        <SelectContent>{Object.keys(KENYA_COUNTIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      {errors.primary_county && <p className="text-xs text-destructive">{errors.primary_county}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Town / Area *</Label>
                      <Input placeholder="e.g. Industrial Area, Godown 5" value={form.primary_town} onChange={(e) => upd("primary_town", e.target.value)} />
                      {errors.primary_town && <p className="text-xs text-destructive">{errors.primary_town}</p>}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Additional Locations</p>
                    <Button type="button" size="sm" variant="outline" onClick={addLocation}>
                      <Plus className="h-4 w-4 mr-1" /> Add Location
                    </Button>
                  </div>
                  {form.additional_locations.length === 0 && <p className="text-xs text-muted-foreground">No additional branches/warehouses added.</p>}
                  {form.additional_locations.map((loc, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2 relative">
                      <button type="button" onClick={() => removeLocation(i)} className="absolute right-2 top-2 text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">County</Label>
                          <Select value={loc.county} onValueChange={(v) => updateLocation(i, "county", v)}>
                            <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                            <SelectContent>{Object.keys(KENYA_COUNTIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                          {errors[`add_county_${i}`] && <p className="text-xs text-destructive">{errors[`add_county_${i}`]}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Town / Area</Label>
                          <Input value={loc.town} onChange={(e) => updateLocation(i, "town", e.target.value)} />
                          {errors[`add_town_${i}`] && <p className="text-xs text-destructive">{errors[`add_town_${i}`]}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Product Type</Label>
                  <Input value="Potatoes" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Varieties Required *</Label>
                  <div className="flex flex-wrap gap-2">
                    {VARIETIES.map((v) => {
                      const active = form.varieties_required.includes(v);
                      return (
                        <Badge
                          key={v}
                          variant={active ? "default" : "outline"}
                          className="cursor-pointer select-none px-3 py-1.5"
                          onClick={() => toggleArr("varieties_required", v)}
                        >
                          {v}
                        </Badge>
                      );
                    })}
                  </div>
                  {errors.varieties_required && <p className="text-xs text-destructive">{errors.varieties_required}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Other variety (optional)</Label>
                  <Input placeholder="Type a custom variety" value={form.varieties_other} onChange={(e) => upd("varieties_other", e.target.value)} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                  <div className="space-y-2">
                    <Label>Quantity per Order *</Label>
                    <Input type="number" min="0" step="0.1" value={form.quantity_per_order} onChange={(e) => upd("quantity_per_order", e.target.value)} />
                    {errors.quantity_per_order && <p className="text-xs text-destructive">{errors.quantity_per_order}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Unit *</Label>
                    <Select value={form.quantity_unit} onValueChange={(v) => upd("quantity_unit", v as any)}>
                      <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kg">Kg</SelectItem>
                        <SelectItem value="Tons">Tons</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.quantity_unit && <p className="text-xs text-destructive">{errors.quantity_unit}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Frequency of Demand *</Label>
                  <Select value={form.demand_frequency} onValueChange={(v) => upd("demand_frequency", v)}>
                    <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                  {errors.demand_frequency && <p className="text-xs text-destructive">{errors.demand_frequency}</p>}
                </div>
                {form.demand_frequency === "Custom" && (
                  <div className="space-y-2">
                    <Label>Describe your frequency *</Label>
                    <Input placeholder="Every 2–3 days" value={form.demand_frequency_custom} onChange={(e) => upd("demand_frequency_custom", e.target.value)} />
                    {errors.demand_frequency_custom && <p className="text-xs text-destructive">{errors.demand_frequency_custom}</p>}
                  </div>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <div className="space-y-2">
                  <Label>Quality Preference *</Label>
                  <Select value={form.quality_preference} onValueChange={(v) => upd("quality_preference", v as any)}>
                    <SelectTrigger><SelectValue placeholder="Select preference" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Flexible">Flexible / Any</SelectItem>
                      <SelectItem value="Custom">Custom (Tell us about it)</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.quality_preference && <p className="text-xs text-destructive">{errors.quality_preference}</p>}
                </div>
                {form.quality_preference === "Custom" && (
                  <div className="space-y-2">
                    <Label>Describe your quality specifications *</Label>
                    <Textarea rows={5} value={form.quality_specifications} onChange={(e) => upd("quality_specifications", e.target.value)} />
                    {errors.quality_specifications && <p className="text-xs text-destructive">{errors.quality_specifications}</p>}
                  </div>
                )}
              </>
            )}

            {step === 5 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input value={form.contact_full_name} onChange={(e) => upd("contact_full_name", e.target.value)} />
                    {errors.contact_full_name && <p className="text-xs text-destructive">{errors.contact_full_name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Role / Position *</Label>
                    <Input placeholder="e.g. Procurement Manager" value={form.contact_role} onChange={(e) => upd("contact_role", e.target.value)} />
                    {errors.contact_role && <p className="text-xs text-destructive">{errors.contact_role}</p>}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <Input value={form.phone_number} onChange={(e) => upd("phone_number", e.target.value)} />
                    {errors.phone_number && <p className="text-xs text-destructive">{errors.phone_number}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input type="email" value={form.contact_email} onChange={(e) => upd("contact_email", e.target.value)} />
                    {errors.contact_email && <p className="text-xs text-destructive">{errors.contact_email}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preferred Contact Method *</Label>
                  <div className="flex flex-wrap gap-2">
                    {CONTACT_METHODS.map((m) => {
                      const active = form.preferred_contact_methods.includes(m);
                      return (
                        <Badge key={m} variant={active ? "default" : "outline"} className="cursor-pointer select-none px-3 py-1.5"
                          onClick={() => toggleArr("preferred_contact_methods", m)}>
                          {m}
                        </Badge>
                      );
                    })}
                  </div>
                  {errors.preferred_contact_methods && <p className="text-xs text-destructive">{errors.preferred_contact_methods}</p>}
                </div>
              </>
            )}

            {step === 6 && (
              <div className="space-y-2">
                <Label>Anything else we should know?</Label>
                <Textarea rows={6} value={form.additional_notes} onChange={(e) => upd("additional_notes", e.target.value)} />
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={prev} disabled={step === 0 || submitting}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Profile"}
              </Button>
            )}
          </div>

          <p className="mt-6 text-center text-sm">
            <Link to="/login" className="underline">Already have an account? Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
