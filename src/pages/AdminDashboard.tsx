import { useState, useEffect } from "react";
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
import { Sprout, Users, ShoppingCart, LogOut, CheckCircle, XCircle, DollarSign, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
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

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
      if (!isAdmin) navigate("/admin/login");
    };
    checkAuth();
  }, [navigate]);

  const { data: farmers = [] } = useQuery({
    queryKey: ["admin-farmers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("farmers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as DbTables<"farmers">[];
    },
  });

  const { data: buyers = [] } = useQuery({
    queryKey: ["admin-buyers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buyers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as DbTables<"buyers">[];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("*, buyers(*), farmers(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateFarmer = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DbTables<"farmers">> }) => {
      const { error } = await supabase.from("farmers").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-farmers"] }); toast.success("Farmer updated"); },
  });

  const deleteFarmer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("farmers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-farmers"] }); toast.success("Farmer deleted"); },
  });

  const deleteBuyer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("buyers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-buyers"] }); toast.success("Buyer deleted"); },
  });

  const updateBooking = useMutation({
    mutationFn: async ({ id, farmerId, status, booking }: { id: string; farmerId: string; status: "approved" | "rejected"; booking?: any }) => {
      const { error: bookingErr } = await supabase.from("bookings").update({
        booking_status: status,
        payment_status: status === "approved" ? "paid" : "rejected",
      }).eq("id", id);
      if (bookingErr) throw bookingErr;

      const { error: farmerErr } = await supabase.from("farmers").update({
        listing_status: status === "approved" ? "booked" : "available",
      }).eq("id", farmerId);
      if (farmerErr) throw farmerErr;

      if (status === "approved" && booking) {
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
          toast.error("Booking approved but email notification failed");
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-farmers"] });
      toast.success("Booking updated");
    },
  });

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/admin/login"); };

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
    const { error } = await supabase.from("buyers").update(buyerFormState).eq("id", editingBuyer.id);
    if (error) { toast.error("Failed to update buyer"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-buyers"] });
    toast.success("Buyer updated");
    setEditingBuyer(null);
  };

  const pendingFarmers = farmers.filter((f) => f.registration_status === "pending").length;
  const pendingBookings = bookings.filter((b: any) => b.booking_status === "pending_approval").length;

  // Revenue split: exclude promo registrations from farmer revenue
  const farmerRevenue = farmers
    .filter((f) => f.payment_status === "paid")
    .reduce((sum, f) => sum + (f.registration_fee || 0), 0);
  const buyerRevenue = bookings
    .filter((b: any) => b.booking_status === "approved")
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
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        </div>

        <Tabs defaultValue="farmers">
          <TabsList>
            <TabsTrigger value="farmers">Farmers ({farmers.length})</TabsTrigger>
            <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
            <TabsTrigger value="buyers">Buyers ({buyers.length})</TabsTrigger>
          </TabsList>

          {/* Farmers Tab */}
          <TabsContent value="farmers">
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
                    <TableHead>Fee</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Listing</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {farmers.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.farmer_id}</TableCell>
                      <TableCell>{f.full_name}</TableCell>
                      <TableCell>{f.phone_number}</TableCell>
                      <TableCell>{f.county}, {f.ward}</TableCell>
                      <TableCell>{f.potato_variety}</TableCell>
                      <TableCell>{f.acreage_planted}</TableCell>
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
                                <CheckCircle className="mr-1 h-3 w-3" /> Approve
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
                  {bookings.map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.buyers?.buyer_name}</TableCell>
                      <TableCell className="text-xs">{b.buyers?.phone_number}<br />{b.buyers?.email}</TableCell>
                      <TableCell className="font-mono text-xs">{b.farmers?.farmer_id}</TableCell>
                      <TableCell>{b.acres_booked}</TableCell>
                      <TableCell>Ksh {b.total_amount?.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{b.payment_status}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={b.booking_status === "approved" ? "default" : b.booking_status === "rejected" ? "destructive" : "secondary"}>
                          {b.booking_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(b.created_at), "dd MMM yy")}</TableCell>
                      <TableCell>
                        {b.booking_status === "pending_approval" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => updateBooking.mutate({ id: b.id, farmerId: b.farmer_id, status: "approved", booking: b })}>
                              <CheckCircle className="mr-1 h-3 w-3" /> Approve
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
                  {buyers.map((b) => (
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
