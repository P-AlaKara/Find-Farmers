import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

const Navbar = () => {
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img 
            src="/logo.svg" 
            alt="PotatoMarket logo" 
            className="h-10 w-10 object-contain"
          />
          <span className="font-display text-xl font-bold text-foreground">PotatoMarket</span>
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/marketplace")}>
            Marketplace
          </Button>
          <Button variant="outline" onClick={() => navigate("/register-farmer")}>
            Register as Farmer
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/login")} title="Admin">
            <ShieldCheck className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
