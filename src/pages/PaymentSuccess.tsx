import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as {
    type?: string;
    buyerName?: string;
    farmerId?: string;
    acresBooked?: string;
    amountPaid?: number;
    reference?: string;
  } | null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-16">
        <Card className="max-w-xl mx-auto">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
            <CardTitle className="text-3xl">Payment Successful</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Your payment was successful and your booking has been recorded.</p>
            {state?.type === "booking" && (
              <div className="space-y-2 rounded-lg border bg-secondary/50 p-4">
                <p><span className="font-semibold">Buyer:</span> {state.buyerName}</p>
                <p><span className="font-semibold">Farmer ID:</span> {state.farmerId}</p>
                <p><span className="font-semibold">Acres:</span> {state.acresBooked}</p>
                <p><span className="font-semibold">Amount Paid:</span> Ksh {state.amountPaid?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Transaction reference: {state.reference}</p>
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="w-full" onClick={() => navigate("/marketplace")}>View Marketplace</Button>
              <Button variant="outline" className="w-full" onClick={() => navigate("/")}>Back to Home</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentSuccess;
