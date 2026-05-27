import { useState, useEffect, useMemo } from "react";
import { getSession, signOut } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sprout, Users, ShoppingCart, LogOut, CheckCircle, XCircle, DollarSign, Pencil, Trash2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer } from "recharts";
import type { Tables as DbTables } from "@/integrations/supabase/types";
import { HARVEST_DAYS } from "@/data/kenyaLocations";

const getEstimatedHarvest = (plantingDate: string, variety: string) => {
  const days = HARVEST_DAYS[variety] || 100;
  const d = new Date(plantingDate);
  d.setDate(d.getDate() + days);
  return d;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingFarmer, setEditingFarmer] = useState<DbTables<"farmers"> | null>(null);
  const [editingBuyer, setEditingBuyer] = useState<DbTables<"buyers"> | null>(null);
  const [farmerForm, setFarmerForm] = useState<any>({});
  const [buyerFormState, setBuyerFormState] = useState<any>({});
  const [farmerFilters, setFarmerFilters] = useState({ search: "", status: "all", county: "all" });
  const [bookingFilters, setBookingFilters] = useState({ search: "", status: "all", payment: "all" });
  const [buyerFilters, setBuyerFilters] = useState({ search: "", county: "all" });
  const [complaintFilters, setComplaintFilters] = useState({ search: "", status: "all" });

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== "admin") navigate("/login");
  }, [navigate]);

  const { data: farmers = [] } = useQuery({
    queryKey: ["admin-farmers"],
    queryFn: async () => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/farmers", { body: { admin_id: session?.userId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return (data?.data || []) as DbTables<"farmers">[];
    },
  });

  const { data: buyers = [] } = useQuery({
    queryKey: ["admin-buyers"],
    queryFn: async () => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/buyers", { body: { admin_id: session?.userId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return (data?.data || []) as DbTables<"buyers">[];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/bookings", { body: { admin_id: session?.userId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data?.data || [];
    },
  });

  const { data: complaints = [] } = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: async () => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/complaints", { body: { admin_id: session?.userId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data?.data || [];
    },
  });

  const updateFarmer = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DbTables<"farmers">> }) => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/farmer/update", { body: { admin_id: session?.userId, id, updates } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-farmers"] }); toast.success("Farmer updated"); },
  });

  const deleteFarmer = useMutation({
    mutationFn: async (id: string) => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/farmer/delete", { body: { admin_id: session?.userId, id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-farmers"] }); toast.success("Farmer deleted"); },
  });

  const deleteBuyer = useMutation({
    mutationFn: async (id: string) => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/buyer/delete", { body: { admin_id: session?.userId, id } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-buyers"] }); toast.success("Buyer deleted"); },
  });

  const updateBooking = useMutation({
    mutationFn: async ({ id, farmerId, status, booking }: { id: string; farmerId: string; status: "confirmed" | "rejected"; booking?: any }) => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/booking/update", { body: { admin_id: session?.userId, id, farmerId, status } });
      if (error || data?.error) throw new Error(data?.error || error?.message);

      if (status === "confirmed" && booking) {
        try {
          await supabase.functions.invoke("send-booking-email", {
            body: {
              buyerEmail: booking.buyers?.email,
              buyerName: booking.buyers?.buyer_name,
              farmerName: booking.farmers?.full_name,
              farmerPhone: booking.farmers?.phone_number,
              farmerLocation: `${booking.farmers?.county}, ${booking.farmers?.ward}, ${booking.farmers?.specific_location}`,
              potatoVariety: booking.farmers?.potato_variety,
              acresBooked: booking.acres_booked,
            },
          });
        } catch (emailErr) {
          console.error("Email notification failed:", emailErr);
          toast.error("Booking confirmed but email notification failed");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-farmers"] });
      toast.success("Booking updated");
    },
  });

  const updateComplaint = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "open" | "in_review" | "resolved" }) => {
      const session = getSession();
      const { data, error } = await supabase.functions.invoke("api-auth/admin/complaint/update", { body: { admin_id: session?.userId, id, status } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
      toast.success("Complaint updated");
    },
  });

  const handleLogout = async () => { await signOut(); navigate("/login"); };

  const openEditFarmer = (f: DbTables<"farmers">) => {
    setFarmerForm({ full_name: f.full_name, phone_number: f.phone_number, email: f.email || "", county: f.county, ward: f.ward, specific_location: f.specific_location, potato_variety: f.potato_variety, acreage_planted: f.acreage_planted });
    setEditingFarmer(f);
  };

  const saveEditFarmer = () => {
    if (!editingFarmer) return;
    updateFarmer.mutate({ id: editingFarmer.id, updates: { ...farmerForm, acreage_planted: parseFloat(farmerForm.acreage_planted) } });
    setEditingFarmer(null);
  };

  const openEditBuyer = (b: DbTables<"buyers">) => {
    setBuyerFormState({ buyer_name: b.buyer_name, phone_number: b.phone_number, email: b.email, county: b.county });
    setEditingBuyer(b);
  };

  const saveEditBuyer = async () => {
    if (!editingBuyer) return;
    const session = getSession();
    const { data, error } = await supabase.functions.invoke("api-auth/admin/buyer/update", { body: { admin_id: session?.userId, id: editingBuyer.id, updates: buyerFormState } });
    if (error || data?.error) { toast.error(data?.error || "Failed to update buyer"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-buyers"] });
    toast.success("Buyer updated");
    setEditingBuyer(null);
  };

  const filteredFarmers = useMemo(() => farmers.filter((f) => {
    const q = farmerFilters.search.trim().toLowerCase();
    if (q && !(f.farmer_id?.toLowerCase().includes(q) || f.full_name?.toLowerCase().includes(q) || f.phone_number?.toLowerCase().includes(q))) return false;
    if (farmerFilters.status !== "all" && f.registration_status !== farmerFilters.status) return false;
    if (farmerFilters.county !== "all" && f.county !== farmerFilters.county) return false;
    return true;
  }), [farmers, farmerFilters]);

  const filteredBookings = useMemo(() => bookings.filter((b: any) => {
    const q = bookingFilters.search.trim().toLowerCase();
    if (q && !(String(b.id).toLowerCase().includes(q) || String(b.farmers?.farmer_id || "").toLowerCase().includes(q) || String(b.buyers?.buyer_name || "").toLowerCase().includes(q))) return false;
    if (bookingFilters.status !== "all" && b.booking_status !== bookingFilters.status) return false;
    if (bookingFilters.payment !== "all" && b.payment_status !== bookingFilters.payment) return false;
    return true;
  }), [bookings, bookingFilters]);

  const filteredBuyers = useMemo(() => buyers.filter((b) => {
    const q = buyerFilters.search.trim().toLowerCase();
    if (q && !(String(b.buyer_name || "").toLowerCase().includes(q) || String(b.phone_number || "").toLowerCase().includes(q) || String(b.email || "").toLowerCase().includes(q))) return false;
    if (buyerFilters.county !== "all" && b.county !== buyerFilters.county) return false;
    return true;
  }), [buyers, buyerFilters]);

  const filteredComplaints = useMemo(() => complaints.filter((c: any) => {
    const q = complaintFilters.search.trim().toLowerCase();
    if (q && !(
      String(c.subject || "").toLowerCase().includes(q) ||
      String(c.content || "").toLowerCase().includes(q) ||
      String(c.buyers?.buyer_name || "").toLowerCase().includes(q) ||
      String(c.bookings?.id || "").toLowerCase().includes(q)
    )) return false;
    if (complaintFilters.status !== "all" && c.status !== complaintFilters.status) return false;
    return true;
  }), [complaints, complaintFilters]);

  const pendingFarmers = farmers.filter((f) => f.registration_status === "pending").length;
  const pendingBookings = bookings.filter((b: any) => b.booking_status === "pending_approval").length;
  const openComplaints = complaints.filter((c: any) => c.status === "open").length;

  // Revenue split: exclude promo registrations from farmer revenue
  const farmerRevenue = farmers
    .filter((f) => f.payment_status === "paid")
    .reduce((sum, f) => sum + (f.registration_fee || 0), 0);
  const buyerRevenue = bookings
    .filter((b: any) => b.booking_status === "confirmed")
    .reduce((sum: number, b: any) => sum + (b.total_amount || 0), 0);
  const totalRevenue = farmerRevenue + buyerRevenue;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Sprout className="h-6 w-6 text-primary" />
            <span className="font-display text-lg font-bold">Admin Dashboard</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <div className="container py-8">
        {/* Summary Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-primary/10 p-3"><Sprout className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Farmers</p>
                <p className="text-2xl font-bold">{farmers.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-accent/10 p-3"><Users className="h-6 w-6 text-accent" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Buyers</p>
                <p className="text-2xl font-bold">{buyers.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-destructive/10 p-3"><ShoppingCart className="h-6 w-6 text-destructive" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
                <p className="text-2xl font-bold">{pendingFarmers + pendingBookings}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">Total Revenue</p>
              </div>
              <p className="text-xl font-bold">Ksh {totalRevenue.toLocaleString()}</p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>Farmers: Ksh {farmerRevenue.toLocaleString()}</p>
                <p>Buyers: Ksh {buyerRevenue.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Promo Registrations</p>
              <p className="text-2xl font-bold">{farmers.filter(f => f.payment_status === "promo_code").length}</p>
              <p className="text-xs text-muted-foreground mt-1">Not counted in revenue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-full bg-amber-500/10 p-3"><AlertCircle className="h-6 w-6 text-amber-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Open Complaints</p>
                <p className="text-2xl font-bold">{openComplaints}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-4 flex justify-end"><Button variant="outline" onClick={() => { queryClient.invalidateQueries({ queryKey: ["admin-farmers"] }); queryClient.invalidateQueries({ queryKey: ["admin-buyers"] }); queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }); queryClient.invalidateQueries({ queryKey: ["admin-complaints"] }); }}>Refresh</Button></div>

        <Tabs defaultValue="analytics">
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="farmers">Farmers ({filteredFarmers.length}/{farmers.length})</TabsTrigger>
            <TabsTrigger value="bookings">Bookings ({filteredBookings.length}/{bookings.length})</TabsTrigger>
            <TabsTrigger value="buyers">Buyers ({filteredBuyers.length}/{buyers.length})</TabsTrigger>
            <TabsTrigger value="complaints">Complaints ({filteredComplaints.length}/{complaints.length})</TabsTrigger>
          </TabsList>



          <TabsContent value="analytics">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Acreage by County</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={Object.entries(farmers.reduce((a:any,f:any)=>{a[f.county]=(a[f.county]||0)+Number(f.acreage_planted||0);return a;},{})).map(([county,total])=>({county,total}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="county"/><YAxis/><Tooltip/><Bar dataKey="total" fill="#3b82f6"/></BarChart></ResponsiveContainer></CardContent></Card>
              <Card><CardHeader><CardTitle>Bookings by Status</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={Object.entries(bookings.reduce((a:any,b:any)=>{a[b.booking_status||'unknown']=(a[b.booking_status||'unknown']||0)+1;return a;},{})).map(([name,value])=>({name,value}))} dataKey="value" nameKey="name" outerRadius={90}>{[0,1,2,3].map((i)=><Cell key={i} fill={["#2563eb", "#16a34a", "#f59e0b", "#ef4444"][i%4]} />)}</Pie></PieChart></ResponsiveContainer></CardContent></Card>
            </div>
          </TabsContent>

          {/* Farmers Tab */}
          <TabsContent value="farmers">
            <div className="mb-3 flex flex-wrap gap-2">
              <Input className="w-64" placeholder="Search farmer ID/name/phone" value={farmerFilters.search} onChange={(e)=>setFarmerFilters((p)=>({...p, search:e.target.value}))} />
              <Select value={farmerFilters.status} onValueChange={(v)=>setFarmerFilters((p)=>({...p,status:v}))}><SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
              <Select value={farmerFilters.county} onValueChange={(v)=>setFarmerFilters((p)=>({...p,county:v}))}><SelectTrigger className="w-44"><SelectValue placeholder="County" /></SelectTrigger><SelectContent><SelectItem value="all">All counties</SelectItem>{Array.from(new Set(farmers.map(f=>f.county).filter(Boolean))).map((c)=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="rounded-lg border overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farmer ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>County / Ward</TableHead>
                    <TableHead>Variety</TableHead>
                    <TableHead>Acreage</TableHead>
                    <TableHead>Est. Harvest</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Listing</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFarmers.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.farmer_id}</TableCell>
                      <TableCell>{f.full_name}</TableCell>
                      <TableCell>{f.phone_number}</TableCell>
                      <TableCell>{f.county}, {f.ward}</TableCell>
                      <TableCell>{f.potato_variety}</TableCell>
                      <TableCell>{f.acreage_planted}</TableCell>
                      <TableCell className="text-xs">{format(getEstimatedHarvest(f.planting_date, f.potato_variety), "dd MMM yy")}</TableCell>
                      <TableCell>Ksh {f.registration_fee?.toLocaleString() ?? "0"}</TableCell>
                      <TableCell>
                        <Select
                          value={f.payment_status}
                          onValueChange={(v) => updateFarmer.mutate({ id: f.id, updates: { payment_status: v as any } })}
                        >
                          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="promo_code">Promo</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.registration_status === "approved" ? "default" : f.registration_status === "rejected" ? "destructive" : "secondary"}>
                          {f.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline">{f.listing_status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {f.registration_status === "pending" && (
                            <>
                              <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => updateFarmer.mutate({ id: f.id, updates: { registration_status: "approved", listing_status: "available" } })}>
                                <CheckCircle className="mr-1 h-3 w-3" /> Confirm
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateFarmer.mutate({ id: f.id, updates: { registration_status: "rejected" } })}>
                                <XCircle className="mr-1 h-3 w-3" /> Reject
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditFarmer(f)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (confirm("Delete this farmer?")) deleteFarmer.mutate(f.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings">
            <div className="mb-3 flex flex-wrap gap-2">
              <Input className="w-64" placeholder="Search booking ID/farmer/buyer" value={bookingFilters.search} onChange={(e)=>setBookingFilters((p)=>({...p, search:e.target.value}))} />
              <Select value={bookingFilters.status} onValueChange={(v)=>setBookingFilters((p)=>({...p,status:v}))}><SelectTrigger className="w-44"><SelectValue placeholder="Booking status" /></SelectTrigger><SelectContent><SelectItem value="all">All booking statuses</SelectItem><SelectItem value="pending_approval">Pending approval</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
              <Select value={bookingFilters.payment} onValueChange={(v)=>setBookingFilters((p)=>({...p,payment:v}))}><SelectTrigger className="w-44"><SelectValue placeholder="Payment status" /></SelectTrigger><SelectContent><SelectItem value="all">All payment statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="promo_code">Promo</SelectItem></SelectContent></Select>
            </div>
            <div className="rounded-lg border overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Farmer ID</TableHead>
                    <TableHead>Acres</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.buyers?.buyer_name}</TableCell>
                      <TableCell className="text-xs">{b.buyers?.phone_number}<br />{b.buyers?.email}</TableCell>
                      <TableCell className="font-mono text-xs">{b.farmers?.farmer_id}</TableCell>
                      <TableCell>{b.acres_booked}</TableCell>
                      <TableCell>Ksh {b.total_amount?.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{b.payment_status}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={b.booking_status === "confirmed" ? "default" : b.booking_status === "rejected" ? "destructive" : "secondary"}>
                          {b.booking_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(b.created_at), "dd MMM yy")}</TableCell>
                      <TableCell>
                        {b.booking_status === "pending_approval" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => updateBooking.mutate({ id: b.id, farmerId: b.farmer_id, status: "confirmed", booking: b })}>
                              <CheckCircle className="mr-1 h-3 w-3" /> Confirm
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => updateBooking.mutate({ id: b.id, farmerId: b.farmer_id, status: "rejected", booking: b })}>
                              <XCircle className="mr-1 h-3 w-3" /> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Buyers Tab */}
          <TabsContent value="buyers">
            <div className="mb-3 flex flex-wrap gap-2">
              <Input className="w-64" placeholder="Search name/phone/email" value={buyerFilters.search} onChange={(e)=>setBuyerFilters((p)=>({...p,search:e.target.value}))} />
              <Select value={buyerFilters.county} onValueChange={(v)=>setBuyerFilters((p)=>({...p,county:v}))}><SelectTrigger className="w-44"><SelectValue placeholder="County" /></SelectTrigger><SelectContent><SelectItem value="all">All counties</SelectItem>{Array.from(new Set(buyers.map(b=>b.county).filter(Boolean))).map((c)=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="rounded-lg border overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBuyers.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.buyer_name}</TableCell>
                      <TableCell>{b.phone_number}</TableCell>
                      <TableCell>{b.email}</TableCell>
                      <TableCell>{b.county}</TableCell>
                      <TableCell>{format(new Date(b.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditBuyer(b)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { if (confirm("Delete this buyer?")) deleteBuyer.mutate(b.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="complaints">
            <div className="mb-3 flex flex-wrap gap-2">
              <Input className="w-64" placeholder="Search buyer/subject/booking" value={complaintFilters.search} onChange={(e)=>setComplaintFilters((p)=>({...p,search:e.target.value}))} />
              <Select value={complaintFilters.status} onValueChange={(v)=>setComplaintFilters((p)=>({...p,status:v}))}><SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="in_review">In review</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select>
            </div>
            <div className="rounded-lg border overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComplaints.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>{c.buyers?.buyer_name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{c.buyers?.phone_number}<br />{c.buyers?.email}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.bookings?.id ? (
                          <>
                            <div className="font-mono">{String(c.bookings.id).slice(0, 8)}</div>
                            <div>{c.bookings?.farmers?.farmer_id || c.bookings?.farmers?.full_name || ""}</div>
                          </>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="font-medium">{c.subject}</TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">{String(c.content || "").slice(0, 180)}{String(c.content || "").length > 180 ? "..." : ""}</TableCell>
                      <TableCell>
                        <Select
                          value={c.status}
                          onValueChange={(v) => updateComplaint.mutate({ id: c.id, status: v as "open" | "in_review" | "resolved" })}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_review">In review</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(c.created_at), "dd MMM yy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Farmer Dialog */}
      <Dialog open={!!editingFarmer} onOpenChange={(o) => !o && setEditingFarmer(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Farmer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input value={farmerForm.full_name || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={farmerForm.phone_number || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, phone_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={farmerForm.email || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>County</Label>
              <Input value={farmerForm.county || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, county: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Ward</Label>
              <Input value={farmerForm.ward || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, ward: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input value={farmerForm.specific_location || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, specific_location: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Variety</Label>
              <Input value={farmerForm.potato_variety || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, potato_variety: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Acreage</Label>
              <Input type="number" min="0.1" step="0.1" value={farmerForm.acreage_planted || ""} onChange={(e) => setFarmerForm((p: any) => ({ ...p, acreage_planted: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={saveEditFarmer}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Buyer Dialog */}
      <Dialog open={!!editingBuyer} onOpenChange={(o) => !o && setEditingBuyer(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Buyer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={buyerFormState.buyer_name || ""} onChange={(e) => setBuyerFormState((p: any) => ({ ...p, buyer_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={buyerFormState.phone_number || ""} onChange={(e) => setBuyerFormState((p: any) => ({ ...p, phone_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={buyerFormState.email || ""} onChange={(e) => setBuyerFormState((p: any) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>County</Label>
              <Input value={buyerFormState.county || ""} onChange={(e) => setBuyerFormState((p: any) => ({ ...p, county: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={saveEditBuyer}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
