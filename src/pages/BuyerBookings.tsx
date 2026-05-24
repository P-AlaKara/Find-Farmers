import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";

type Row = {
  id: string;
  acres_booked: number;
  price_per_acre: number;
  total_amount: number | null;
  payment_status: string;
  booking_status: string;
  created_at: string;
  farmers: { full_name: string; county: string; phone_number: string; potato_variety: string } | null;
};

type BuyerProfile = {
  buyer_name: string | null;
  phone_number: string | null;
  email: string | null;
  county: string | null;
  company_name: string | null;
  business_type: string | null;
  primary_county: string | null;
  primary_town: string | null;
  contact_full_name: string | null;
  contact_role: string | null;
};

const fmtKES = (n: number) => `KES ${Number(n).toLocaleString()}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function BuyerBookings() {
  const session = getSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [{ data: profileData }, { data: bookingsData, error }] = await Promise.all([
        supabase.functions.invoke("api-auth/buyer/profile/get", { body: { buyer_id: session.userId } }),
        supabase.functions.invoke("api-auth/buyer/bookings", { body: { buyer_id: session.userId } }),
      ]);
      if (profileData?.data) setProfile(profileData.data as BuyerProfile);
      if (!error && !bookingsData?.error) setRows((bookingsData?.data as unknown as Row[]) || []);
      setLoading(false);
    })();
  }, [session]);

  if (!session || session.role !== "buyer") return <Navigate to="/login" replace />;

  return (
    <div className="container max-w-5xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Procurement</h1>
          <p className="text-sm text-muted-foreground">Your booked farms and reserved supply</p>
        </div>
        <Button asChild variant="outline"><Link to="/marketplace">Back to Marketplace</Link></Button>
      </div>

      {profile && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Profile Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground">Company</div><div>{profile.company_name || profile.buyer_name || "-"}</div></div>
            <div><div className="text-muted-foreground">Business Type</div><div>{profile.business_type ?? "-"}</div></div>
            <div><div className="text-muted-foreground">Contact</div><div>{profile.contact_full_name || profile.buyer_name || "-"}</div></div>
            <div><div className="text-muted-foreground">Role</div><div>{profile.contact_role ?? "-"}</div></div>
            <div><div className="text-muted-foreground">Phone</div><div>{profile.phone_number ?? "-"}</div></div>
            <div><div className="text-muted-foreground">Email</div><div>{profile.email ?? "-"}</div></div>
            <div><div className="text-muted-foreground">Primary Location</div><div>{profile.primary_county || profile.county || "-"}{profile.primary_town ? `, ${profile.primary_town}` : ""}</div></div>
            <div><div className="text-muted-foreground">Bookings</div><div>{rows.length}</div></div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">You have no bookings yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">Booking Ref: <span className="font-mono text-sm">{r.id}</span></CardTitle>
                  <div className="flex gap-2">
                    <Badge variant={r.payment_status === "paid" ? "default" : "secondary"}>Payment: {r.payment_status}</Badge>
                    <Badge variant="outline">Status: {r.booking_status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><div className="text-muted-foreground">Farmer</div><div>{r.farmers?.full_name ?? "—"}</div></div>
                <div><div className="text-muted-foreground">County</div><div>{r.farmers?.county ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Phone</div><div>{r.farmers?.phone_number ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Potato Variety</div><div>{r.farmers?.potato_variety ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Acres Booked</div><div>{r.acres_booked}</div></div>
                <div><div className="text-muted-foreground">Price / Acre</div><div>{fmtKES(r.price_per_acre)}</div></div>
                <div><div className="text-muted-foreground">Total Amount</div><div className="font-semibold">{fmtKES(r.total_amount ?? r.acres_booked * r.price_per_acre)}</div></div>
                <div><div className="text-muted-foreground">Date Created</div><div>{fmtDate(r.created_at)}</div></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
