import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const { buyerEmail, buyerName, farmerName, farmerPhone, farmerLocation, potatoVariety, acresBooked } = await req.json();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #16a34a; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🥔 Booking Confirmed!</h1>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #374151;">Hello <strong>${buyerName}</strong>,</p>
          <p style="font-size: 15px; color: #374151;">Your potato farmer booking has been <span style="color: #16a34a; font-weight: bold;">approved</span>. Here are the farmer's details:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 8px; font-weight: bold; color: #374151; width: 40%;">Farmer Name</td>
              <td style="padding: 12px 8px; color: #374151;">${farmerName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <td style="padding: 12px 8px; font-weight: bold; color: #374151;">Phone Number</td>
              <td style="padding: 12px 8px; color: #374151;">${farmerPhone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px 8px; font-weight: bold; color: #374151;">Location</td>
              <td style="padding: 12px 8px; color: #374151;">${farmerLocation}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <td style="padding: 12px 8px; font-weight: bold; color: #374151;">Potato Variety</td>
              <td style="padding: 12px 8px; color: #374151;">${potatoVariety}</td>
            </tr>
            <tr>
              <td style="padding: 12px 8px; font-weight: bold; color: #374151;">Acres Booked</td>
              <td style="padding: 12px 8px; color: #374151;">${acresBooked}</td>
            </tr>
          </table>

          <p style="font-size: 15px; color: #374151;">Please contact the farmer directly to coordinate the next steps.</p>
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">Thank you for using Potato Market Kenya!</p>
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Potato Market <onboarding@resend.dev>',
        to: [buyerEmail],
        subject: '🥔 Farmer Booking Confirmed - Potato Market Kenya',
        html: htmlContent,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Resend API error:', data);
      throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
    }

    console.log('Email sent successfully:', data);

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
