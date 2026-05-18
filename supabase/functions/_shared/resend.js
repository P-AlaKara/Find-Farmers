export async function sendEmail(to, subject, html) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || (typeof process !== "undefined" ? process.env.RESEND_API_KEY : undefined);
  const from = Deno.env.get("RESEND_FROM_EMAIL") || (typeof process !== "undefined" ? process.env.RESEND_FROM_EMAIL : undefined);

  if (!apiKey) {
    console.warn("Email notifications disabled — RESEND_API_KEY not configured");
    return;
  }

  const payload = { from, to, subject, html };
  console.log("[Resend] Request payload:", payload);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log("[Resend] Response status:", res.status);
    console.log("[Resend] Response body:", responseText);
  } catch (error) {
    console.error("[Resend] Email send failed:", error);
  }
}
