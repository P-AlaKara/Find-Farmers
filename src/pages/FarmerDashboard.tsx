import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSession, clearSession } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function FarmerDashboard() {
  const [status, setStatus] = useState(""); const navigate = useNavigate();
  const session = getSession();
  useEffect(() => { (async()=>{
    if (!session) return;
    const { data } = await supabase.from("farmers").select("registration_status").eq("id", session.userId).maybeSingle();
    setStatus(data?.registration_status || "");
  })(); }, [session]);
  return <div className="container py-12"><div className="flex justify-between"><h1 className="text-2xl">Farmer Dashboard</h1><Button variant="outline" onClick={()=>{clearSession(); navigate('/login')}}>Logout</Button></div>{status==="pending" && <p className="mt-4">Your account is pending approval.</p>}</div>;
}
