import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, clearSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Booking = {
  id: string;
  acres_booked: number;
  total_amount: number | null;
  price_per_acre: number;
  payment_status: string;
  booking_status: string;
  created_at: string;
  buyer_id: string;
  buyers?: { buyer_name: string; phone_number: string; email: string; county: string } | null;
};

const fmtKES = (n: number) => `KES ${Number(n).toLocaleString()}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function FarmerDashboard() {
  const navigate = useNavigate();
  const session = getSession();
  const [farmer, setFarmer] = useState<{ registration_status: string; listing_status: string; full_name: string } | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: f } = await supabase.from("farmers").select("registration_status, listing_status, full_name").eq("id", session.userId).maybeSingle();
      setFarmer(f as any);
      const { data: b } = await supabase
        .from("bookings")
        .select("id, acres_booked, total_amount, price_per_acre, payment_status, booking_status, created_at, buyer_id, buyers(buyer_name, phone_number, email, county)")
        .eq("farmer_id", session.userId)
        .order("created_at", { ascending: false });
      setBookings((b as unknown as Booking[]) || []);
      setLoading(false);
    })();
  }, [session]);

  if (!session || session.role !== "farmer") return <Navigate to="/login" replace />;

  const statusBadge = () => {
    if (farmer?.registration_status === "pending") return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Pending Approval</Badge>;
    if (farmer?.listing_status === "booked") return <Badge className="bg-blue-600 hover:bg-blue-600 text-white">Booked</Badge>;
    if (farmer?.listing_status === "available") return <Badge className="bg-green-600 hover:bg-green-600 text-white">Available</Badge>;
    return <Badge variant="secondary">{farmer?.listing_status ?? "—"}</Badge>;
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Farmer Dashboard</h1>
          {farmer?.full_name && <p className="text-muted-foreground text-sm">Welcome, {farmer.full_name}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/farmer/settings">Profile & Settings</Link></Button>
          <Button variant="destructive" onClick={() => { clearSession(); navigate("/login"); }}>Logout</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Listing Status</CardTitle>{statusBadge()}</CardHeader>
        {farmer?.registration_status === "pending" && (
          <CardContent><p className="text-sm text-muted-foreground">Your account is pending approval. You will be notified once approved.</p></CardContent>
        )}
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">My Bookings</h2>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : bookings.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">You have no bookings yet.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((r) => (
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
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><div className="text-muted-foreground">Booking Date</div><div>{fmtDate(r.created_at)}</div></div>
                    <div><div className="text-muted-foreground">Acres Booked</div><div>{r.acres_booked}</div></div>
                    <div><div className="text-muted-foreground">Total Amount</div><div className="font-semibold">{fmtKES(r.total_amount ?? r.acres_booked * r.price_per_acre)}</div></div>
                    <div><div className="text-muted-foreground">Payment</div><div>{r.payment_status}</div></div>
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger asChild><Button variant="outline" size="sm">View Buyer Details</Button></CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-t pt-3">
                      <div><div className="text-muted-foreground">Buyer Name</div><div>{r.buyers?.buyer_name ?? "—"}</div></div>
                      <div><div className="text-muted-foreground">Phone</div><div>{r.buyers?.phone_number ?? "—"}</div></div>
                      <div><div className="text-muted-foreground">Email</div><div>{r.buyers?.email ?? "—"}</div></div>
                      <div><div className="text-muted-foreground">County</div><div>{r.buyers?.county ?? "—"}</div></div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
