import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CheckCheck } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-background">
      <div className="container py-16">
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader className="text-center bg-emerald-50 rounded-t-lg">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-emerald-100 p-4">
                <CheckCircle2 className="h-16 w-16 text-emerald-600" />
              </div>
            </div>
            <CardTitle className="text-4xl font-bold text-emerald-600">Booking Confirmed!</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">Your payment was successful</p>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-3">
              <p className="text-base font-semibold text-foreground">Your booking has been completed successfully.</p>
              <p className="text-sm text-muted-foreground">Your payment has been processed and your booking is now recorded in the system. You will receive a confirmation email shortly.</p>
            </div>

            {state?.type === "booking" && (
              <div className="space-y-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2">
                  <CheckCheck className="h-5 w-5 text-emerald-600" />
                  <p className="font-semibold text-emerald-900">Booking Details</p>
                </div>
                <div className="grid gap-3 text-sm ml-7">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buyer Name:</span>
                    <span className="font-semibold">{state.buyerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Farmer ID:</span>
                    <Badge variant="outline">{state.farmerId}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Acres Booked:</span>
                    <span className="font-semibold">{state.acresBooked} acres</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="font-semibold">Amount Paid:</span>
                    <span className="font-bold text-emerald-600">Ksh {state.amountPaid?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-blue-50 p-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Transaction Reference:</span>
                <br />
                {state?.reference}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row pt-4">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => navigate("/marketplace")}>
                Continue Shopping
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentSuccess;
