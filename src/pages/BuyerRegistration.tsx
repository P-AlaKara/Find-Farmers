import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KENYA_COUNTIES } from "@/data/kenyaLocations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BuyerRegistration() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    buyer_name: "",
    phone_number: "",
    email: "",
    county: "",
    password: "",
    confirm_password: "",
  });

  const onChange = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const buyer_name = form.buyer_name.trim();
    const phone_number = form.phone_number.trim();
    const email = form.email.trim().toLowerCase();
    const county = form.county;

    if (!buyer_name || !phone_number || !email || !county || !form.password || !form.confirm_password) {
      toast.error("Please fill all required fields.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm_password) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.functions.invoke("api-auth/register-buyer", {
      body: { buyer_name, phone_number, email, county, password: form.password, confirm_password: form.confirm_password },
    });
    setLoading(false);

    if (error || !data?.ok) {
      toast.error(data?.error || "Failed to create buyer account.");
      return;
    }

    toast.success("Buyer account created. Please sign in.");
    navigate("/login", { state: { message: "Your buyer account is ready. Please sign in." } });
  };

  return (
    <div className="container max-w-lg min-h-[80vh] flex items-center justify-center py-12">
      <Card className="w-full shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Register as Buyer</CardTitle>
          <CardDescription>Create your buyer account and start booking farms.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.buyer_name} onChange={(e) => onChange("buyer_name", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input value={form.phone_number} onChange={(e) => onChange("phone_number", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>County *</Label>
              <Select value={form.county} onValueChange={(v) => onChange("county", v)}>
                <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(KENYA_COUNTIES).map((county) => (
                    <SelectItem key={county} value={county}>{county}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input type="password" value={form.password} onChange={(e) => onChange("password", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password *</Label>
                <Input type="password" value={form.confirm_password} onChange={(e) => onChange("confirm_password", e.target.value)} required />
              </div>
            </div>
            <Button className="w-full" disabled={loading}>{loading ? "Creating account..." : "Create Buyer Account"}</Button>
            <div className="text-center text-sm">
              <Link to="/login" className="underline">Already have an account? Sign in</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
