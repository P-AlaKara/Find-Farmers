import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { KENYA_COUNTIES, POTATO_VARIETIES } from "@/data/kenyaLocations";
import PaystackInline from "@paystack/inline-js";

const FarmerRegistration = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [starterAccess, setStarterAccess] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone_number: "",
    email: "",
    county: "",
    ward: "",
    specific_location: "",
    potato_variety: "",
    acreage_planted: "",
    planting_date: "",
  });

  const wards = form.county ? KENYA_COUNTIES[form.county] || [] : [];
  const acreage = parseFloat(form.acreage_planted) || 0;
  const registrationFee = starterAccess ? 0 : acreage * 2000;

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "county") setForm((prev) => ({ ...prev, county: value, ward: "" }));
  };

  // Persist form state so reloads keep the entered data.
  useEffect(() => {
    const saved = localStorage.getItem("farmerRegistrationForm");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm((prev) => ({ ...prev, ...parsed }));
        if (parsed.starterAccess) setStarterAccess(true);
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

  useEffect(() => {
    const payload = {
      ...form,
      starterAccess,
    };
    localStorage.setItem("farmerRegistrationForm", JSON.stringify(payload));
  }, [form, starterAccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.phone_number || !form.county || !form.ward || !form.specific_location || !form.potato_variety || !form.acreage_planted || !form.planting_date) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (starterAccess) {
      setLoading(true);
      const { error } = await supabase.from("farmers").insert({
        full_name: form.full_name,
        phone_number: form.phone_number,
        email: form.email || null,
        county: form.county,
        ward: form.ward,
        specific_location: form.specific_location,
        potato_variety: form.potato_variety,
        acreage_planted: acreage,
        planting_date: form.planting_date,
        payment_status: 'promo_code',
      });
      setLoading(false);

      if (error) {
        toast.error("Registration failed. Please try again.");
        console.error(error);
        return;
      }
      toast.success("Registration submitted! Your listing is pending approval.");
      localStorage.removeItem("farmerRegistrationForm");
      navigate("/");
    } else {
      // Pay with Paystack
      setLoading(true);
      const paystack = new PaystackInline();
      paystack.newTransaction({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: form.email || `${form.phone_number}@temp.com`, // fallback if no email
        amount: Math.round(registrationFee * 100), // in cents
        currency: "KES",
        reference: `registration-${Date.now()}`,
        phone: form.phone_number,
        channels: ["mobile_money"],
        onSuccess: async (response: any) => {
          // Payment successful
          try {
            const { error } = await supabase.from("farmers").insert({
              full_name: form.full_name,
              phone_number: form.phone_number,
              email: form.email || null,
              county: form.county,
              ward: form.ward,
              specific_location: form.specific_location,
              potato_variety: form.potato_variety,
              acreage_planted: acreage,
              planting_date: form.planting_date,
              payment_status: 'paid',
            });

            if (error) {
              toast.error("Registration failed. Please try again.");
              console.error(error);
              setLoading(false);
              return;
            }
            setLoading(false);
            toast.success("Registration successful!");
            localStorage.removeItem("farmerRegistrationForm");
            navigate("/payment-success", {
              state: {
                type: "registration",
                amountPaid: registrationFee,
                reference: response.reference,
              },
            });
          } catch (err) {
            console.error(err);
            toast.error("An error occurred");
            setLoading(false);
          }
        },
        onError: (error: any) => {
          console.error("Paystack error", error);
          toast.error("Payment failed. Please try again.");
          setLoading(false);
        },
        onClose: () => {
          setLoading(false);
        },
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container max-w-2xl py-12">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">Register as a Farmer</CardTitle>
            <CardDescription>Fill in your farm details to list on the marketplace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={form.full_name} onChange={(e) => handleChange("full_name", e.target.value)} placeholder="John Kamau" required />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input value={form.phone_number} onChange={(e) => handleChange("phone_number", e.target.value)} placeholder="0712345678" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email (Optional)</Label>
                <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="farmer@email.com" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>County *</Label>
                  <Select value={form.county} onValueChange={(v) => handleChange("county", v)}>
                    <SelectTrigger><SelectValue placeholder="Select County" /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(KENYA_COUNTIES).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ward *</Label>
                  <Select value={form.ward} onValueChange={(v) => handleChange("ward", v)} disabled={!form.county}>
                    <SelectTrigger><SelectValue placeholder="Select Ward" /></SelectTrigger>
                    <SelectContent>
                      {wards.map((w) => (
                        <SelectItem key={w} value={w}>{w}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Specific Location / Village *</Label>
                <Input value={form.specific_location} onChange={(e) => handleChange("specific_location", e.target.value)} placeholder="e.g., Kinamba Village" required />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Potato Variety *</Label>
                  <Select value={form.potato_variety} onValueChange={(v) => handleChange("potato_variety", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {POTATO_VARIETIES.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Acreage Planted *</Label>
                  <Input type="number" min="0.1" step="0.1" value={form.acreage_planted} onChange={(e) => handleChange("acreage_planted", e.target.value)} placeholder="e.g., 0.25" required />
                </div>
                <div className="space-y-2">
                  <Label>Planting Date *</Label>
                  <Input type="date" value={form.planting_date} onChange={(e) => handleChange("planting_date", e.target.value)} required />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="starterAccess"
                  checked={starterAccess}
                  onChange={(e) => setStarterAccess(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="starterAccess" className="text-sm">
                  Starter Access (Free Promo - No Payment Required)
                </Label>
              </div>

              {acreage > 0 && !starterAccess && (
                <div className="rounded-lg border bg-secondary/50 p-4">
                  <p className="text-sm text-muted-foreground">Registration Fee:</p>
                  <p className="font-display text-2xl font-bold text-primary">
                    Ksh {registrationFee.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{acreage} acre(s) × Ksh 2,000</p>
                </div>
              )}

              {starterAccess && (
                <div className="rounded-lg border-2 border-green-500/30 bg-green-50 p-6 space-y-3">
                  <h3 className="font-display text-lg font-semibold text-foreground">Starter Access Promo</h3>
                  <p className="text-sm text-muted-foreground">
                    Congratulations! You've selected Starter Access. No payment is required. Your registration will be processed as a promo.
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Processing..." : starterAccess ? "Submit Registration" : "Pay with Paystack"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FarmerRegistration;
