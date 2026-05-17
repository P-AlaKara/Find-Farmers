import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Marketplace from "./pages/Marketplace";
import FarmerRegistration from "./pages/FarmerRegistration";
import AdminDashboard from "./pages/AdminDashboard";
import PaymentSuccess from "./pages/PaymentSuccess";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SetupAccount from "./pages/SetupAccount";
import FarmerDashboard from "./pages/FarmerDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner />
    <HashRouter><Routes>
      <Route path="/" element={<Home />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/register-farmer" element={<FarmerRegistration />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/login" element={<Login />} />
      <Route path="/setup-account" element={<SetupAccount />} />
      <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/farmer/dashboard" element={<ProtectedRoute role="farmer"><FarmerDashboard /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes></HashRouter>
  </TooltipProvider></QueryClientProvider>
);

export default App;
