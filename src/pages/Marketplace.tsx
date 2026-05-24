import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/auth";
import { KENYA_COUNTIES, POTATO_VARIETIES, HARVEST_DAYS } from "@/data/kenyaLocations";
import { MapPin, Calendar, Wheat, LayoutGrid, TableIcon, Search, Loader2, CheckCircle2, Smartphone, LogIn } from "lucide-react";
import { format, addDays } from "date-fns";

const getEstimatedHarvest = (plantingDate: string, variety: string) => {
  const days = HARVEST_DAYS[variety] || 100;
  return addDays(new Date(plantingDate), days);
};

const PRICE_PER_ACRE = 5000;

const Marketplace = () => {
  const queryClient = useQueryClient();
  const session = getSession();
  const isBuyer = session?.role === "buyer";

  const [filters, setFilters] = useState({ county: "", variety: "", search: "" });
  const [bookingFarmer, setBookingFarmer] = useState<any>(null);
  const [authPromptFarmer, setAuthPromptFarmer] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [paymentOverlay, setPaymentOverlay] = useState<{ reference: string; bookingRef: string; message: string; paid: boolean; timeout: boolean } | null>(null);

  const { data: farmers = [], isLoading } = useQuery({
    queryKey: ["marketplace-farmers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farmers")
        .select("*")
        .eq("registration_status", "approved")
        .eq("listing_status", "available");
      if (error) throw error;
      return (data || []).sort((a, b) => {
        const ha = getEstimatedHarvest(a.planting_date, a.potato_variety);
        const hb = getEstimatedHarvest(b.planting_date, b.potato_variety);
        return ha.getTime() - hb.getTime();
      });
    },
  });

  const filtered = farmers.filter((f) => {
    if (filters.county && f.county !== filters.county) return false;
    if (filters.variety && f.potato_variety !== filters.variety) return false;
    if (filters.search && !f.farmer_id?.toLowerCase().includes(filters.search.toLowerCase()) && !f.county.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const onBookClick = (farmer: any) => {
    if (!isBuyer) {
      setAuthPromptFarmer(farmer);
      return;
    }
    setBookingFarmer(farmer);
    setModalMessage(null);
  };

  const closeBooking = () => {
    if (submitting) return;
    setBookingFarmer(null);
    setModalMessage(null);
  };

  const confirmBooking = async () => {
    if (!bookingFarmer || !session) return;
    setModalMessage(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("initialize-payment", {
        body: { farmer_id: bookingFarmer.id, buyer_id: session.userId },
      });
      if (error || data?.ok === false || !data?.data?.reference) {
        const msg = data?.request_id
          ? `${data?.error || "We could not start the M-Pesa payment. Please try again."} Reference: ${data.request_id}`
          : data?.error || "We could not start the M-Pesa payment. Please try again.";
        setModalMessage({ type: "error", text: msg });
        setSubmitting(false);
        return;
      }
      const { reference, booking_ref, message } = data.data;
      setSubmitting(false);
      setBookingFarmer(null);
      setPaymentOverlay({ reference, bookingRef: booking_ref, message, paid: false, timeout: false });

      let attempts = 0;
      const maxAttempts = 75;
      const intervalId = window.setInterval(async () => {
        attempts += 1;
        const { data: statusData, error: statusError } = await supabase.functions.invoke(`booking-status?reference=${reference}`, { method: "GET" });
        if (!statusError && statusData?.data?.payment_status === "paid") {
          window.clearInterval(intervalId);
          setPaymentOverlay((prev) => prev ? { ...prev, paid: true } : prev);
          setSuccessBanner("Booking confirmed! The farm has been reserved for you.");
          toast.success("Booking confirmed!");
          queryClient.invalidateQueries({ queryKey: ["marketplace-farmers"] });
        } else if (attempts >= maxAttempts) {
          window.clearInterval(intervalId);
          setPaymentOverlay((prev) => prev ? { ...prev, timeout: true } : prev);
        }
      }, 4000);
    } catch {
      setModalMessage({ type: "error", text: "We could not start the M-Pesa payment. Please try again." });
      setSubmitting(false);
    }
  };

  const totalPrice = bookingFarmer ? Number(bookingFarmer.acreage_planted) * PRICE_PER_ACRE : 0;

  const FarmerCard = ({ farmer }: { farmer: any }) => {
    const harvest = getEstimatedHarvest(farmer.planting_date, farmer.potato_variety);
    return (
      <Card className="group overflow-hidden transition-all hover:shadow-lg">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-primary">{farmer.farmer_id}</span>
            <Badge>Available</Badge>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary/70" /><span>{farmer.county}, {farmer.ward}</span></div>
            <div className="flex items-center gap-2"><Wheat className="h-4 w-4 text-primary/70" /><span>{farmer.potato_variety} — {farmer.acreage_planted} acres</span></div>
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary/70" /><span>Planted: {format(new Date(farmer.planting_date), "dd MMM yyyy")}</span></div>
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-harvest-gold" /><span className="font-medium text-foreground">Harvest: ~{format(harvest, "dd MMM yyyy")}</span></div>
          </div>
          <Button className="mt-4 w-full" onClick={() => onBookClick(farmer)}>Book Farm</Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground">Potato Marketplace</h1>
          <p className="mt-1 text-muted-foreground">Browse available potato farms sorted by nearest harvest date</p>
        </div>

        {successBanner && (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-primary/30 bg-primary/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-foreground">{successBanner}</p>
            </div>
            <button onClick={() => setSuccessBanner(null)} className="text-sm text-muted-foreground hover:text-foreground">Dismiss</button>
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by ID or county..." value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
          </div>
          <Select value={filters.county} onValueChange={(v) => setFilters((p) => ({ ...p, county: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Counties" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Counties</SelectItem>
              {Object.keys(KENYA_COUNTIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.variety} onValueChange={(v) => setFilters((p) => ({ ...p, variety: v === "all" ? "" : v }))}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All Varieties" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Varieties</SelectItem>
              {POTATO_VARIETIES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="cards">
          <TabsList className="mb-4">
            <TabsTrigger value="cards"><LayoutGrid className="mr-1 h-4 w-4" /> Cards</TabsTrigger>
            <TabsTrigger value="table"><TableIcon className="mr-1 h-4 w-4" /> Table</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-12">Loading listings...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No available listings found.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((f) => <FarmerCard key={f.id} farmer={f} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="table">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farmer ID</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Ward</TableHead>
                    <TableHead>Variety</TableHead>
                    <TableHead>Acreage</TableHead>
                    <TableHead>Planting Date</TableHead>
                    <TableHead>Est. Harvest</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f) => {
                    const harvest = getEstimatedHarvest(f.planting_date, f.potato_variety);
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-sm">{f.farmer_id}</TableCell>
                        <TableCell>{f.county}</TableCell>
                        <TableCell>{f.ward}</TableCell>
                        <TableCell>{f.potato_variety}</TableCell>
                        <TableCell>{f.acreage_planted}</TableCell>
                        <TableCell>{format(new Date(f.planting_date), "dd MMM yy")}</TableCell>
                        <TableCell>{format(harvest, "dd MMM yy")}</TableCell>
                        <TableCell><Button size="sm" onClick={() => onBookClick(f)}>Book</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Auth prompt for non-buyers */}
      <Dialog open={!!authPromptFarmer} onOpenChange={(o) => !o && setAuthPromptFarmer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to book this farm</DialogTitle>
            <DialogDescription>You need a buyer account to reserve farms. Sign in or create your buyer profile to continue.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild><Link to="/login"><LogIn className="h-4 w-4 mr-2" /> Sign In</Link></Button>
            <Button asChild variant="outline"><Link to="/register-buyer">Create Buyer Account</Link></Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for buyers */}
      <Dialog open={!!bookingFarmer} onOpenChange={(o) => !o && closeBooking()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>You are about to reserve the full farm. This cannot be partially booked.</DialogDescription>
          </DialogHeader>
          {bookingFarmer && (
            <div className="space-y-3 rounded-lg border bg-secondary/30 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Farmer</span><span className="font-medium">{bookingFarmer.farmer_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span>{bookingFarmer.county}, {bookingFarmer.ward}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Variety</span><span>{bookingFarmer.potato_variety}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Acreage</span><span className="font-medium">{bookingFarmer.acreage_planted} acres</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price / Acre</span><span>KES {PRICE_PER_ACRE.toLocaleString()}</span></div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-muted-foreground">Total</span>
                <span className="font-display text-xl font-bold text-primary">KES {totalPrice.toLocaleString()}</span>
              </div>
            </div>
          )}
          {modalMessage && (
            <div className={`rounded-md border p-3 text-sm ${modalMessage.type === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10"}`}>
              {modalMessage.text}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeBooking} disabled={submitting}>Cancel</Button>
            <Button onClick={confirmBooking} disabled={submitting}>
              {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : "Confirm & Pay"}
            </Button>
          </DialogFooter>
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
                <p className="text-sm text-destructive">⚠️ Once you enter your PIN, the payment cannot be cancelled or refunded.</p>
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
                <div className="flex gap-3 justify-center">
                  <Button asChild><Link to="/buyer/bookings">View My Procurement</Link></Button>
                  <Button variant="outline" onClick={() => setPaymentOverlay(null)}>Close</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
