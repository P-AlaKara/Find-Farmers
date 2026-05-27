import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Edit3, RefreshCw, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { validateComplaint, validateReceiptConfirmation } from "@/lib/buyerDashboard";
import { KENYA_COUNTIES } from "@/data/kenyaLocations";

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
  additional_notes: string | null;
};

type Booking = {
  id: string;
  acres_booked: number;
  price_per_acre: number;
  total_amount: number | null;
  payment_status: string;
  booking_status: string;
  created_at: string;
  received_confirmed_at: string | null;
  final_price: number | null;
  delivery_date: string | null;
  buyer_rating: number | null;
  farmers: { full_name: string; county: string; phone_number: string; potato_variety: string; farmer_id?: string | null } | null;
};

type Complaint = {
  id: string;
  booking_id: string | null;
  subject: string;
  content: string;
  status: string;
  created_at: string;
  bookings?: { id: string; farmers?: { full_name: string | null; farmer_id: string | null } | null } | null;
};

const BUSINESS_TYPES = ["Offtaker / Bulk Buyer", "Processor", "Hotel", "School / Institution", "Supermarket / Retailer", "Exporter", "Trader / Reseller", "Other"];
const fmtKES = (n: number | null | undefined) => `KES ${Number(n || 0).toLocaleString()}`;
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const statusVariant = (status: string) => status === "confirmed" || status === "resolved" ? "default" : status === "rejected" ? "destructive" : "secondary";

export default function BuyerDashboard() {
  const session = getSession();
  const buyerId = session?.userId;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [historicalBookings, setHistoricalBookings] = useState<Booking[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [receiptBooking, setReceiptBooking] = useState<Booking | null>(null);
  const [receiptForm, setReceiptForm] = useState({ finalPrice: "", deliveryDate: "", rating: "5" });
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ bookingId: "none", subject: "", content: "" });
  const [complaintSaving, setComplaintSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!buyerId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/dashboard", { body: { buyer_id: buyerId } });
    setLoading(false);
    if (error || data?.error) {
      toast.error(data?.error || "Failed to load buyer dashboard");
      return;
    }
    const payload = data?.data || {};
    setProfile(payload.profile || null);
    setActiveBookings(payload.activeBookings || []);
    setPendingBookings(payload.pendingBookings || []);
    setHistoricalBookings(payload.historicalBookings || []);
    setComplaints(payload.complaints || []);
  }, [buyerId]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const allBookings = useMemo(() => [...activeBookings, ...pendingBookings, ...historicalBookings], [activeBookings, pendingBookings, historicalBookings]);
  const openComplaints = complaints.filter((complaint) => complaint.status === "open").length;

  if (!session || session.role !== "buyer") return <Navigate to="/login" replace />;

  const updateProfile = (key: keyof BuyerProfile, value: string) => setProfile((current) => current ? { ...current, [key]: value } : current);

  const saveProfile = async () => {
    if (!profile) return;
    setProfileSaving(true);
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/profile", {
      body: {
        buyer_id: buyerId,
        buyer_name: profile.company_name || profile.buyer_name,
        company_name: profile.company_name,
        business_type: profile.business_type,
        contact_full_name: profile.contact_full_name,
        contact_role: profile.contact_role,
        phone_number: profile.phone_number,
        county: profile.primary_county || profile.county,
        primary_county: profile.primary_county,
        primary_town: profile.primary_town,
        additional_notes: profile.additional_notes,
      },
    });
    setProfileSaving(false);
    if (error || data?.error) toast.error(data?.error || "Failed to save profile");
    else toast.success("Profile updated");
  };

  const openReceiptDialog = (booking: Booking) => {
    setReceiptBooking(booking);
    setReceiptForm({
      finalPrice: String(booking.total_amount ?? booking.acres_booked * booking.price_per_acre),
      deliveryDate: new Date().toISOString().slice(0, 10),
      rating: "5",
    });
  };

  const confirmReceived = async () => {
    if (!receiptBooking) return;
    const validationError = validateReceiptConfirmation(receiptForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setReceiptSaving(true);
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/booking/confirm-received", {
      body: {
        buyer_id: buyerId,
        booking_id: receiptBooking.id,
        final_price: Number(receiptForm.finalPrice),
        delivery_date: receiptForm.deliveryDate,
        buyer_rating: Number(receiptForm.rating),
      },
    });
    setReceiptSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || "Failed to confirm receipt");
      return;
    }
    toast.success("Booking marked as received");
    setReceiptBooking(null);
    await loadDashboard();
  };

  const submitComplaint = async () => {
    const validationError = validateComplaint(complaintForm.subject, complaintForm.content);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setComplaintSaving(true);
    const { data, error } = await supabase.functions.invoke("api-auth/buyer/complaints/create", {
      body: {
        buyer_id: buyerId,
        booking_id: complaintForm.bookingId === "none" ? null : complaintForm.bookingId,
        subject: complaintForm.subject,
        content: complaintForm.content,
      },
    });
    setComplaintSaving(false);
    if (error || data?.error) {
      toast.error(data?.error || "Failed to submit complaint");
      return;
    }
    toast.success("Complaint submitted");
    setComplaintForm({ bookingId: "none", subject: "", content: "" });
    await loadDashboard();
  };

  const BookingCards = ({ rows, action }: { rows: Booking[]; action?: (booking: Booking) => JSX.Element }) => (
    rows.length === 0 ? (
      <Card><CardContent className="py-10 text-center text-muted-foreground">No bookings in this section.</CardContent></Card>
    ) : (
      <div className="grid gap-4">
        {rows.map((booking) => (
          <Card key={booking.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Booking Ref</div>
                  <div className="font-mono text-sm">{booking.id}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(booking.booking_status)}>Status: {booking.booking_status}</Badge>
                  <Badge variant={booking.payment_status === "paid" ? "default" : "outline"}>Payment: {booking.payment_status}</Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><div className="text-muted-foreground">Farmer</div><div>{booking.farmers?.full_name || "-"}</div></div>
                <div><div className="text-muted-foreground">County</div><div>{booking.farmers?.county || "-"}</div></div>
                <div><div className="text-muted-foreground">Phone</div><div>{booking.farmers?.phone_number || "-"}</div></div>
                <div><div className="text-muted-foreground">Variety</div><div>{booking.farmers?.potato_variety || "-"}</div></div>
                <div><div className="text-muted-foreground">Acres</div><div>{booking.acres_booked}</div></div>
                <div><div className="text-muted-foreground">Booked Total</div><div className="font-semibold">{fmtKES(booking.total_amount ?? booking.acres_booked * booking.price_per_acre)}</div></div>
                <div><div className="text-muted-foreground">Created</div><div>{fmtDate(booking.created_at)}</div></div>
                {booking.received_confirmed_at && <div><div className="text-muted-foreground">Received</div><div>{fmtDate(booking.received_confirmed_at)}</div></div>}
                {booking.final_price && <div><div className="text-muted-foreground">Final Price</div><div className="font-semibold">{fmtKES(booking.final_price)}</div></div>}
                {booking.delivery_date && <div><div className="text-muted-foreground">Delivery Date</div><div>{fmtDate(booking.delivery_date)}</div></div>}
                {booking.buyer_rating && <div><div className="text-muted-foreground">Rating</div><div className="flex items-center gap-1"><Star className="h-4 w-4 fill-primary text-primary" /> {booking.buyer_rating}/5</div></div>}
              </div>
              {action && <div className="mt-4 flex justify-end">{action(booking)}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  );

  if (loading) return <div className="container max-w-6xl py-8 text-muted-foreground">Loading buyer dashboard...</div>;

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Buyer Dashboard</h1>
          <p className="text-sm text-muted-foreground">{profile?.company_name || profile?.buyer_name || "Buyer"} procurement workspace</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/marketplace">Marketplace</Link></Button>
          <Button variant="outline" onClick={loadDashboard}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold">{activeBookings.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{pendingBookings.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Historical</p><p className="text-2xl font-bold">{historicalBookings.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Open Complaints</p><p className="text-2xl font-bold">{openComplaints}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg"><Edit3 className="h-5 w-5" /> Profile</CardTitle>
          <Button onClick={saveProfile} disabled={profileSaving}>{profileSaving ? "Saving..." : "Save Profile"}</Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label>Company Name</Label><Input value={profile?.company_name || ""} onChange={(e) => updateProfile("company_name", e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Business Type</Label>
            <Select value={profile?.business_type || ""} onValueChange={(value) => updateProfile("business_type", value)}>
              <SelectTrigger><SelectValue placeholder="Select business type" /></SelectTrigger>
              <SelectContent>{BUSINESS_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Email</Label><Input value={profile?.email || ""} readOnly disabled /></div>
          <div className="space-y-2"><Label>Contact Name</Label><Input value={profile?.contact_full_name || profile?.buyer_name || ""} onChange={(e) => updateProfile("contact_full_name", e.target.value)} /></div>
          <div className="space-y-2"><Label>Contact Role</Label><Input value={profile?.contact_role || ""} onChange={(e) => updateProfile("contact_role", e.target.value)} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={profile?.phone_number || ""} onChange={(e) => updateProfile("phone_number", e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Primary County</Label>
            <Select value={profile?.primary_county || profile?.county || ""} onValueChange={(value) => updateProfile("primary_county", value)}>
              <SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger>
              <SelectContent>{Object.keys(KENYA_COUNTIES).map((county) => <SelectItem key={county} value={county}>{county}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Town / Area</Label><Input value={profile?.primary_town || ""} onChange={(e) => updateProfile("primary_town", e.target.value)} /></div>
          <div className="space-y-2 md:col-span-3"><Label>Notes</Label><Textarea rows={3} value={profile?.additional_notes || ""} onChange={(e) => updateProfile("additional_notes", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Tabs defaultValue="active">
        <TabsList className="flex w-full flex-wrap justify-start h-auto">
          <TabsTrigger value="active">Active ({activeBookings.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingBookings.length})</TabsTrigger>
          <TabsTrigger value="history">History ({historicalBookings.length})</TabsTrigger>
          <TabsTrigger value="complaints">Complaints ({complaints.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <BookingCards rows={activeBookings} action={(booking) => (
            <Button onClick={() => openReceiptDialog(booking)}><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Received</Button>
          )} />
        </TabsContent>
        <TabsContent value="pending" className="mt-4"><BookingCards rows={pendingBookings} /></TabsContent>
        <TabsContent value="history" className="mt-4"><BookingCards rows={historicalBookings} /></TabsContent>
        <TabsContent value="complaints" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><AlertCircle className="h-5 w-5" /> Lodge Complaint</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Related Booking</Label>
                  <Select value={complaintForm.bookingId} onValueChange={(value) => setComplaintForm((current) => ({ ...current, bookingId: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific booking</SelectItem>
                      {allBookings.map((booking) => <SelectItem key={booking.id} value={booking.id}>{booking.farmers?.full_name || "Booking"} - {booking.id.slice(0, 8)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Subject</Label><Input value={complaintForm.subject} onChange={(e) => setComplaintForm((current) => ({ ...current, subject: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Content</Label><Textarea rows={6} value={complaintForm.content} onChange={(e) => setComplaintForm((current) => ({ ...current, content: e.target.value }))} /></div>
                <Button className="w-full" onClick={submitComplaint} disabled={complaintSaving}>{complaintSaving ? "Submitting..." : "Submit Complaint"}</Button>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {complaints.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground">No complaints submitted.</CardContent></Card>
              ) : complaints.map((complaint) => (
                <Card key={complaint.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-semibold">{complaint.subject}</h3><p className="text-xs text-muted-foreground">{fmtDate(complaint.created_at)}</p></div>
                      <Badge variant={statusVariant(complaint.status)}>{complaint.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{complaint.content}</p>
                    {complaint.booking_id && <p className="mt-3 text-xs text-muted-foreground">Booking: {complaint.booking_id}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!receiptBooking} onOpenChange={(open) => !open && setReceiptBooking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm Received</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">Confirm the delivered final price, delivery date, and your rating for this booking.</div>
            <div className="space-y-2"><Label>Final Price</Label><Input type="number" min="1" step="0.01" value={receiptForm.finalPrice} onChange={(e) => setReceiptForm((current) => ({ ...current, finalPrice: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Delivery Date</Label><Input type="date" value={receiptForm.deliveryDate} onChange={(e) => setReceiptForm((current) => ({ ...current, deliveryDate: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Rating</Label><Input type="number" min="1" max="5" step="1" value={receiptForm.rating} onChange={(e) => setReceiptForm((current) => ({ ...current, rating: e.target.value }))} /></div>
            <Button className="w-full" onClick={confirmReceived} disabled={receiptSaving}>{receiptSaving ? "Confirming..." : "Confirm Received"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
