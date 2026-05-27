import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Marketplace from "./pages/Marketplace";
import FarmerRegistration from "./pages/FarmerRegistration";
import BuyerRegistration from "./pages/BuyerRegistration";
import AdminDashboard from "./pages/AdminDashboard";
import PaymentSuccess from "./pages/PaymentSuccess";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SetupAccount from "./pages/SetupAccount";
import FarmerDashboard from "./pages/FarmerDashboard";
import FarmerSettings from "./pages/FarmerSettings";
import BuyerBookings from "./pages/BuyerBookings";
import BuyerSettings from "./pages/BuyerSettings";
import BuyerDashboard from "./pages/BuyerDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthCallback from "./pages/AuthCallback";

const queryClient = new QueryClient();

const isOAuthCallbackPath = () => {
  const basePath = new URL(import.meta.env.BASE_URL, window.location.origin).pathname.replace(/\/$/, "");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hasSupabaseHash = hashParams.has("access_token") || hashParams.has("error") || hashParams.has("error_description");
  return hasSupabaseHash || window.location.pathname === `${basePath}/auth/callback`;
};

const App = () => {
  const content = isOAuthCallbackPath() ? (
    <AuthCallback />
  ) : (
    <HashRouter><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/marketplace" element={<Marketplace />} />
    <Route path="/register-farmer" element={<FarmerRegistration />} />
    <Route path="/register-buyer" element={<BuyerRegistration />} />
    <Route path="/payment-success" element={<PaymentSuccess />} />
    <Route path="/login" element={<Login />} />
    <Route path="/setup-account" element={<SetupAccount />} />
    <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
    <Route path="/farmer/dashboard" element={<ProtectedRoute role="farmer"><FarmerDashboard /></ProtectedRoute>} />
    <Route path="/farmer/settings" element={<ProtectedRoute role="farmer"><FarmerSettings /></ProtectedRoute>} />
    <Route path="/buyer/dashboard" element={<ProtectedRoute role="buyer"><BuyerDashboard /></ProtectedRoute>} />
    <Route path="/buyer/bookings" element={<ProtectedRoute role="buyer"><BuyerBookings /></ProtectedRoute>} />
    <Route path="/buyer/settings" element={<ProtectedRoute role="buyer"><BuyerSettings /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes></HashRouter>
  );

  return (
    <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner />
      {content}
    </TooltipProvider></QueryClientProvider>
  );
};

export default App;
