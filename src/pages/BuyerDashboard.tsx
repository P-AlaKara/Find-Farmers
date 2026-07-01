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
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileClock,
  History,
  Leaf,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  Star,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { validateComplaint, validateReceiptConfirmation } from "@/lib/buyerDashboard";

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
  farmer_confirmed_at: string | null;
  payment_requested_at: string | null;
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

const fmtKES = (n: number | null | undefined) => `KES ${Number(n || 0).toLocaleString()}`;
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const statusVariant = (status: string) => status === "confirmed" || status === "resolved" ? "default" : status === "rejected" ? "destructive" : "secondary";
const prettyStatus = (status: string) => status.replace(/_/g, " ");
const buyerStatusLabel = (booking: Booking) => {
  if (booking.booking_status === "pending_approval") return "Pending farmer confirmation";
  if (booking.booking_status === "approved") return "Farmer confirmed. Complete payment";
  if (booking.booking_status === "confirmed") return "Confirmed";
  return prettyStatus(booking.booking_status);
};

export default function BuyerDashboard() {
  const session = getSession();
  const buyerId = session?.userId;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [activeBookings, setActiveBookings] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [historicalBookings, setHistoricalBookings] = useState<Booking[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [receiptBooking, setReceiptBooking] = useState<Booking | null>(null);
  const [receiptForm, setReceiptForm] = useState({ finalPrice: "", deliveryDate: "", rating: "5" });
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ bookingId: "none", subject: "", content: "" });
  const [complaintSaving, setComplaintSaving] = useState(false);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [paymentOverlay, setPaymentOverlay] = useState<{ reference: string; bookingRef: string; message: string; paid: boolean; timeout: boolean } | null>(null);

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
  const displayName = profile?.contact_full_name || profile?.company_name || profile?.buyer_name || "Buyer";
  const companyName = profile?.company_name || profile?.buyer_name || "Buyer workspace";
  const locationLabel = profile?.primary_town && (profile?.primary_county || profile?.county)
    ? `${profile.primary_town}, ${profile.primary_county || profile.county}`
    : profile?.primary_county || profile?.county || "Procurement coverage";

  if (!session || session.role !== "buyer") return <Navigate to="/login" replace />;

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

  const startPayment = async (booking: Booking) => {
    if (!buyerId) return;
    setPayingBookingId(booking.id);
    const { data, error } = await supabase.functions.invoke("initialize-payment", {
      body: { buyer_id: buyerId, booking_id: booking.id },
    });
    setPayingBookingId(null);
    if (error || data?.ok === false || !data?.data?.reference) {
      toast.error(data?.error || "Could not start payment. Please try again.");
      return;
    }

    const { reference, booking_ref, message } = data.data;
    setPaymentOverlay({ reference, bookingRef: booking_ref, message, paid: false, timeout: false });

    let attempts = 0;
    const maxAttempts = 35;
    const intervalId = window.setInterval(async () => {
      attempts += 1;
      const { data: statusData, error: statusError } = await supabase.functions.invoke(`booking-status?reference=${reference}`, { method: "GET" });
      if (!statusError && statusData?.data?.payment_status === "paid") {
        window.clearInterval(intervalId);
        setPaymentOverlay((prev) => prev ? { ...prev, paid: true } : prev);
        toast.success("Booking confirmed!");
        await loadDashboard();
      } else if (!statusError && statusData?.data?.payment_status === "rejected") {
        window.clearInterval(intervalId);
        setPaymentOverlay((prev) => prev ? { ...prev, timeout: true } : prev);
        toast.error("Payment timed out. The farm has been released.");
        await loadDashboard();
      } else if (attempts >= maxAttempts) {
        window.clearInterval(intervalId);
        setPaymentOverlay((prev) => prev ? { ...prev, timeout: true } : prev);
      }
    }, 4000);
  };

  const BookingCards = ({ rows, action }: { rows: Booking[]; action?: (booking: Booking) => JSX.Element }) => (
    rows.length === 0 ? (
      <Card className="border-dashed bg-white/80 shadow-sm">
        <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="rounded-full bg-emerald-50 p-3 text-primary"><PackageCheck className="h-6 w-6" /></div>
          <div>
            <p className="font-semibold text-slate-900">No bookings in this section</p>
            <p className="mt-1 text-sm text-muted-foreground">New procurement activity will appear here when available.</p>
          </div>
        </CardContent>
      </Card>
    ) : (
      <div className="grid gap-4">
        {rows.map((booking) => (
          <Card key={booking.id} className="overflow-hidden border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 border-l-4 border-l-primary p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">{booking.farmers?.full_name || "Farm booking"}</h3>
                      {booking.farmers?.farmer_id && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{booking.farmers.farmer_id}</span>}
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">Ref {booking.id}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant(booking.booking_status)} className="capitalize">Status: {buyerStatusLabel(booking)}</Badge>
                    <Badge variant={booking.payment_status === "paid" ? "default" : "outline"} className="capitalize">Payment: {prettyStatus(booking.payment_status)}</Badge>
                  </div>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">County</div><div className="mt-1 font-medium text-slate-900">{booking.farmers?.county || "-"}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</div><div className="mt-1 font-medium text-slate-900">{booking.farmers?.phone_number || "-"}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Variety</div><div className="mt-1 font-medium text-slate-900">{booking.farmers?.potato_variety || "-"}</div></div>
                  <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-amber-700">Booked Total</div><div className="mt-1 font-semibold text-slate-950">{fmtKES(booking.total_amount ?? booking.acres_booked * booking.price_per_acre)}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Acres</div><div className="mt-1 font-medium text-slate-900">{booking.acres_booked}</div></div>
                  <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</div><div className="mt-1 font-medium text-slate-900">{fmtDate(booking.created_at)}</div></div>
                  {booking.received_confirmed_at && <div className="rounded-lg bg-emerald-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Received</div><div className="mt-1 font-medium text-slate-900">{fmtDate(booking.received_confirmed_at)}</div></div>}
                  {booking.final_price && <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Final Price</div><div className="mt-1 font-semibold text-slate-950">{fmtKES(booking.final_price)}</div></div>}
                  {booking.delivery_date && <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Delivery Date</div><div className="mt-1 font-medium text-slate-900">{fmtDate(booking.delivery_date)}</div></div>}
                  {booking.buyer_rating && <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rating</div><div className="mt-1 flex items-center gap-1 font-medium text-slate-900"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {booking.buyer_rating}/5</div></div>}
                </div>
                {action && <div className="flex justify-end border-t border-slate-100 pt-4">{action(booking)}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  );

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <div className="container max-w-6xl py-8 text-muted-foreground">Loading buyer dashboard...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container max-w-7xl py-6 md:py-8">
        <section className="overflow-hidden rounded-xl border border-emerald-900/10 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 px-5 py-6 text-white md:px-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50">
                  <Leaf className="h-3.5 w-3.5 text-amber-300" />
                  Buyer procurement workspace
                </div>
                <h1 className="text-2xl font-bold tracking-normal text-white md:text-3xl">Hi, {displayName}</h1>
                <p className="mt-2 max-w-2xl text-sm text-emerald-50/85">
                  Manage farm bookings, supplier receipts, and procurement support for {companyName}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="secondary" className="bg-white text-emerald-950 hover:bg-emerald-50">
                  <Link to="/buyer/settings" aria-label="Open buyer profile"><User className="mr-2 h-4 w-4" /> Profile</Link>
                </Button>
                <Button asChild className="bg-amber-400 text-slate-950 hover:bg-amber-300">
                  <Link to="/marketplace"><ShoppingCart className="mr-2 h-4 w-4" /> Marketplace</Link>
                </Button>
                <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={loadDashboard}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-4 px-5 py-4 text-sm md:grid-cols-3 md:px-7">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Business type</p>
              <p className="mt-1 font-medium text-slate-950">{profile?.business_type || "Buyer account"}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Primary location</p>
              <p className="mt-1 font-medium text-slate-950">{locationLabel}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Contact</p>
              <p className="mt-1 font-medium text-slate-950">{profile?.email || profile?.phone_number || "Profile details pending"}</p>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Active bookings", value: activeBookings.length, icon: PackageCheck, tone: "text-emerald-700", bg: "bg-emerald-50", strip: "bg-emerald-600" },
            { label: "Pending bookings", value: pendingBookings.length, icon: Clock3, tone: "text-amber-700", bg: "bg-amber-50", strip: "bg-amber-500" },
            { label: "Historical bookings", value: historicalBookings.length, icon: History, tone: "text-slate-700", bg: "bg-slate-100", strip: "bg-slate-500" },
            { label: "Open complaints", value: openComplaints, icon: AlertCircle, tone: "text-red-700", bg: "bg-red-50", strip: "bg-red-500" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="relative overflow-hidden border-slate-200 bg-white shadow-sm">
                <div className={`absolute inset-x-0 top-0 h-1 ${item.strip}`} />
                <CardContent className="flex min-h-[128px] items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{item.label}</p>
                    <p className="mt-3 text-3xl font-bold text-slate-950">{item.value}</p>
                  </div>
                  <div className={`rounded-xl ${item.bg} p-3 ${item.tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs defaultValue="active" className="mt-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="active" className="gap-2 rounded-lg data-[state=active]:bg-emerald-900 data-[state=active]:text-white"><PackageCheck className="h-4 w-4" /> Active ({activeBookings.length})</TabsTrigger>
          <TabsTrigger value="pending" className="gap-2 rounded-lg data-[state=active]:bg-emerald-900 data-[state=active]:text-white"><FileClock className="h-4 w-4" /> Pending ({pendingBookings.length})</TabsTrigger>
          <TabsTrigger value="history" className="gap-2 rounded-lg data-[state=active]:bg-emerald-900 data-[state=active]:text-white"><History className="h-4 w-4" /> History ({historicalBookings.length})</TabsTrigger>
          <TabsTrigger value="complaints" className="gap-2 rounded-lg data-[state=active]:bg-emerald-900 data-[state=active]:text-white"><AlertCircle className="h-4 w-4" /> Complaints ({complaints.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <BookingCards rows={activeBookings} action={(booking) => (
            <Button onClick={() => openReceiptDialog(booking)}><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Received</Button>
          )} />
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          <BookingCards rows={pendingBookings} action={(booking) => (
            booking.booking_status === "approved" ? (
              <Button onClick={() => startPayment(booking)} disabled={payingBookingId === booking.id}>
                <CreditCard className="mr-2 h-4 w-4" /> {payingBookingId === booking.id ? "Starting payment..." : "Pay now"}
              </Button>
            ) : (
              <Badge variant="secondary">Pending farmer confirmation</Badge>
            )
          )} />
        </TabsContent>
        <TabsContent value="history" className="mt-4"><BookingCards rows={historicalBookings} /></TabsContent>
        <TabsContent value="complaints" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950"><AlertCircle className="h-5 w-5 text-amber-600" /> Procurement Support</CardTitle>
                <p className="text-sm text-muted-foreground">Log a delivery, quality, or payment issue for follow-up.</p>
              </CardHeader>
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
                <Card className="border-dashed bg-white/80 shadow-sm">
                  <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 py-10 text-center">
                    <div className="rounded-full bg-emerald-50 p-3 text-primary"><CheckCircle2 className="h-6 w-6" /></div>
                    <div>
                      <p className="font-semibold text-slate-900">No complaints submitted</p>
                      <p className="mt-1 text-sm text-muted-foreground">Support cases you raise will be tracked here.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : complaints.map((complaint) => (
                <Card key={complaint.id} className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{complaint.subject}</h3>
                        <p className="text-xs text-muted-foreground">{fmtDate(complaint.created_at)}</p>
                      </div>
                      <Badge variant={statusVariant(complaint.status)} className="capitalize">{prettyStatus(complaint.status)}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{complaint.content}</p>
                    {complaint.booking_id && (
                      <p className="mt-4 inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Booking: {complaint.booking_id}</span>
                      </p>
                    )}
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
      {paymentOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6">
          <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-lg">
            {!paymentOverlay.paid ? (
              <>
                <Smartphone className="mx-auto mb-4 h-14 w-14 text-primary" />
                <h2 className="mb-2 text-2xl font-bold">Check your phone</h2>
                <p className="mb-3 text-muted-foreground">{paymentOverlay.message}</p>
                <p className="mb-3 text-sm font-medium">Do not close this window</p>
                {paymentOverlay.timeout && (
                  <div className="mt-6">
                    <p className="mb-4 text-sm text-muted-foreground">This is taking longer than expected. If you completed the M-Pesa payment, your booking will be confirmed shortly.</p>
                    <Button onClick={() => setPaymentOverlay(null)}>Close</Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-600" />
                <h2 className="mb-2 text-2xl font-bold text-green-700">Booking Confirmed!</h2>
                <p className="mb-2 text-muted-foreground">Your farm has been reserved.</p>
                <p className="mb-6 text-sm font-medium">Booking Ref: {paymentOverlay.bookingRef}</p>
                <Button onClick={() => setPaymentOverlay(null)}>Close</Button>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
