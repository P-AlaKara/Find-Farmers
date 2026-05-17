import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SetupAccount() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const token = params.get("token") || "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  const [pwd, setPwd] = useState(""); const [confirm, setConfirm] = useState("");
  const [contact, setContact] = useState("");
  useEffect(() => { (async()=>{
    if (!token) return setValid(false);
    const { data } = await supabase.functions.invoke(`api-auth/validate-token?token=${encodeURIComponent(token)}`);
    setValid(Boolean(data?.valid));
  })(); }, [token]);

  if (valid === null) return <div className="container py-12">Loading...</div>;
  return <div className="container max-w-md py-12 space-y-3">
    {!valid ? <>
      <p>This link has expired.</p>
      <Input placeholder="Phone number or email" value={contact} onChange={(e)=>setContact(e.target.value)} />
      <Button onClick={async()=>{await supabase.functions.invoke("api-auth/resend-setup-link", { body: { phone_or_email: contact } }); setMsg("If account exists, setup token has been regenerated.");}}>Resend Setup Link</Button>
    </> : <>
      <Input type="password" placeholder="Password" value={pwd} onChange={(e)=>setPwd(e.target.value)} />
      <Input type="password" placeholder="Confirm password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
      <Button onClick={async()=>{ if (pwd !== confirm) return setMsg("Passwords do not match"); const { data } = await supabase.functions.invoke("api-auth/complete-setup", { body: { token, password: pwd } }); if (data?.ok) { navigate("/login", { state: { message: "Account setup complete. Please log in." }}); } else setMsg(data?.error || "Failed"); }}>Complete Setup</Button>
    </>}
    {msg && <p className="text-sm">{msg}</p>}
  </div>;
}
