import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { KENYA_COUNTIES, POTATO_VARIETIES, HARVEST_DAYS } from "@/data/kenyaLocations";
import { MapPin, Calendar, Wheat, LayoutGrid, TableIcon, Search, Loader2, CheckCircle2 } from "lucide-react";
import { format, addDays } from "date-fns";

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

const PAYSTACK_INLINE_SRC = "https://js.paystack.co/v1/inline.js";
const loadPaystack = (): Promise<any> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (window.PaystackPop) return resolve(window.PaystackPop);
    const existing = document.querySelector(`script[src="${PAYSTACK_INLINE_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(window.PaystackPop));
      existing.addEventListener("error", () => reject(new Error("Failed to load Paystack")));
      return;
    }
    const s = document.createElement("script");
    s.src = PAYSTACK_INLINE_SRC;
    s.async = true;
    s.onload = () => resolve(window.PaystackPop);
    s.onerror = () => reject(new Error("Failed to load Paystack"));
    document.head.appendChild(s);
  });

const getEstimatedHarvest = (plantingDate: string, variety: string) => {
  const days = HARVEST_DAYS[variety] || 100;
  return addDays(new Date(plantingDate), days);
};

const statusColor = (status: string) => {
  switch (status) {
    case "available": return "default";
    case "booked": return "destructive";
    case "pending_approval": return "secondary";
    default: return "outline";
  }
};

const Marketplace = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ county: "", variety: "", search: "" });
  const [bookingFarmer, setBookingFarmer] = useState<any>(null);
  const [buyerForm, setBuyerForm] = useState({ buyer_name: "", phone_number: "", email: "", county: "", acres_to_book: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

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

  const openBooking = (farmer: any) => {
    setBookingFarmer(farmer);
    setBuyerForm({ buyer_name: "", phone_number: "", email: "", county: "", acres_to_book: "" });
    setFieldErrors({});
    setModalMessage(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setBookingFarmer(null);
    setFieldErrors({});
    setModalMessage(null);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!buyerForm.buyer_name.trim()) errs.buyer_name = "Full name is required";
    if (!buyerForm.phone_number.trim()) errs.phone_number = "Phone number is required";
    if (!buyerForm.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerForm.email.trim())) errs.email = "Invalid email";
    if (!buyerForm.county.trim()) errs.county = "County is required";
    const acres = parseFloat(buyerForm.acres_to_book);
    if (!buyerForm.acres_to_book || isNaN(acres) || acres <= 0) {
      errs.acres_to_book = "Acres must be greater than 0";
    } else if (bookingFarmer && acres > Number(bookingFarmer.acreage_planted)) {
      errs.acres_to_book = `Cannot exceed ${bookingFarmer.acreage_planted} acres`;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalMessage(null);
    if (!bookingFarmer || !validate()) return;

    const acres = parseFloat(buyerForm.acres_to_book);
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("initialize-payment", {
        body: {
          farmer_id: bookingFarmer.id,
          name: buyerForm.buyer_name.trim(),
          phone: buyerForm.phone_number.trim(),
          email: buyerForm.email.trim(),
          county: buyerForm.county,
          acres,
        },
      });

      if (error || !data?.data?.access_code) {
        const msg = (data as any)?.error || error?.message || "Failed to initialize payment";
        setModalMessage({ type: "error", text: msg });
        setSubmitting(false);
        return;
      }

      const { access_code, booking_ref } = data.data;
      const PaystackPop = await loadPaystack();
      const handler = PaystackPop.setup({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: buyerForm.email.trim(),
        amount: Math.round(acres * 5000 * 100),
        ref: booking_ref,
        access_code,
        onSuccess: () => {
          setSubmitting(false);
          setBookingFarmer(null);
          setFieldErrors({});
          setModalMessage(null);
          setSuccessBanner("Booking confirmed! We will be in touch shortly.");
          toast.success("Booking confirmed! We will be in touch shortly.");
          queryClient.invalidateQueries({ queryKey: ["marketplace-farmers"] });
        },
        onCancel: () => {
          setSubmitting(false);
          setModalMessage({ type: "info", text: "Payment cancelled. You can try again." });
        },
      });
      handler.openIframe();
    } catch (err: any) {
      console.error(err);
      setModalMessage({ type: "error", text: err?.message || "Something went wrong" });
      setSubmitting(false);
    }
  };

  const totalPrice = (parseFloat(buyerForm.acres_to_book) || 0) * 5000;

  const FarmerCard = ({ farmer }: { farmer: any }) => {
    const harvest = getEstimatedHarvest(farmer.planting_date, farmer.potato_variety);
    return (
      <Card className="group overflow-hidden transition-all hover:shadow-lg">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-primary">{farmer.farmer_id}</span>
            <Badge variant={statusColor(farmer.listing_status) as any}>
              {farmer.listing_status === "available" ? "Available" : farmer.listing_status}
            </Badge>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary/70" />
              <span>{farmer.county}, {farmer.ward}</span>
            </div>
            <div className="flex items-center gap-2">
              <Wheat className="h-4 w-4 text-primary/70" />
              <span>{farmer.potato_variety} — {farmer.acreage_planted} acres</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary/70" />
              <span>Planted: {format(new Date(farmer.planting_date), "dd MMM yyyy")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-harvest-gold" />
              <span className="font-medium text-foreground">Harvest: ~{format(harvest, "dd MMM yyyy")}</span>
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={() => openBooking(farmer)}>
            Book Farmer
          </Button>
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

        {/* Filters */}
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
                    <TableHead>Status</TableHead>
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
                        <TableCell><Badge variant={statusColor(f.listing_status) as any}>{f.listing_status}</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => openBooking(f)}>Book</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Booking Dialog */}
      <Dialog open={!!bookingFarmer} onOpenChange={(o) => !o && setBookingFarmer(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Book Farmer {bookingFarmer?.farmer_id}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBooking} className="space-y-4">
            <div className="space-y-2">
              <Label>Name (Individual or Business) *</Label>
              <Input value={buyerForm.buyer_name} onChange={(e) => setBuyerForm((p) => ({ ...p, buyer_name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input value={buyerForm.phone_number} onChange={(e) => setBuyerForm((p) => ({ ...p, phone_number: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={buyerForm.email} onChange={(e) => setBuyerForm((p) => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>County *</Label>
              <Select value={buyerForm.county} onValueChange={(v) => setBuyerForm((p) => ({ ...p, county: v }))}>
                <SelectTrigger><SelectValue placeholder="Select County" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(KENYA_COUNTIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Acres to Book</Label>
              <Input type="number" min="0.0001" step="0.0001" placeholder="e.g. 0.0001" value={buyerForm.acres_to_book} onChange={(e) => setBuyerForm((p) => ({ ...p, acres_to_book: e.target.value }))} />
            </div>

            <div className="rounded-lg border bg-secondary/50 p-4">
              <p className="text-sm text-muted-foreground">Total Price:</p>
              <p className="font-display text-2xl font-bold text-primary">Ksh {totalPrice.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{buyerForm.acres_to_book} acre(s) × Ksh 5,000</p>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Processing Payment..." : "Pay with Paystack"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;
