import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { Sprout, ShoppingCart, Shield, TrendingUp } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary py-24 md:py-32">
        <div className="container relative z-10 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Sprout className="h-4 w-4" />
              Kenya's Premier Potato Marketplace
            </div>
            <h1 className="mb-6 font-display text-4xl font-extrabold leading-tight text-foreground md:text-6xl">
              From Farm to Market,{" "}
              <span className="text-primary">Simplified</span>
            </h1>
            <p className="mb-10 text-lg text-muted-foreground md:text-xl">
              Connect directly with potato farmers across Kenya. Browse available farms, book acreage, and secure your supply with transparent pricing.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="text-lg px-8" onClick={() => navigate("/marketplace")}>
                Browse Marketplace
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" onClick={() => navigate("/register-farmer")}>
                Register Your Farm
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container">
          <h2 className="mb-12 text-center font-display text-3xl font-bold text-foreground">
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { icon: Sprout, title: "Farmers Register", desc: "Register your potato farm with variety, acreage, and planting details." },
              { icon: ShoppingCart, title: "Buyers Book", desc: "Browse approved listings and book acreage at Ksh 5,000 per acre." },
              { icon: Shield, title: "Verified & Connected", desc: "Admin verifies payments and connects buyers directly to farmers." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group rounded-xl border bg-card p-8 text-center transition-shadow hover:shadow-lg">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-2 font-display text-xl font-semibold text-foreground">{title}</h3>
                <p className="text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-primary/5 py-16">
        <div className="container grid grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { label: "Price Per Acre", value: "Ksh 5,000" },
            { label: "Registration Fee", value: "Ksh 2,000/acre" },
            { label: "Paybill Number", value: "542542" },
            { label: "Account Number", value: "324567" },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="font-display text-2xl font-bold text-primary md:text-3xl">{value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© 2026 PotatoMarket Kenya. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
