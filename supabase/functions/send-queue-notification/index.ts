import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// Helper to import PKCS8 private key string into CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s+/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

// Generate OAuth2 access token for Firebase Cloud Messaging
async function getAccessToken(clientEmail: string, pemKey: string): Promise<string> {
  const privateKey = await importPrivateKey(pemKey);

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: getNumericDate(3600),
      iat: getNumericDate(0),
    },
    privateKey
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`JWT exchange failed: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

// Send actual notification payload to FCM HTTP v1
async function sendFcmNotification(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title,
          body,
        },
        data,
      },
    }),
  });

  return await response.json();
}

// Send notification to all registered tokens for a user
async function sendStatusNotification(
  supabase: any,
  projectId: string,
  accessToken: string,
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("fcm_token")
    .eq("user_id", userId);

  if (error) {
    console.error(`[NOTIF] Error fetching tokens for user ${userId}:`, error.message);
    return;
  }

  if (!tokens || tokens.length === 0) {
    console.log(`[NOTIF] No device tokens found for user ${userId}.`);
    return;
  }

  for (const t of tokens) {
    try {
      const res = await sendFcmNotification(projectId, accessToken, t.fcm_token, title, body, data);
      console.log(`[NOTIF] Sent to user ${userId}:`, res);
    } catch (err) {
      console.error(`[NOTIF] Failed to send to token ${t.fcm_token.substring(0, 10)}...:`, err);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const payload = await req.json();
    console.log("[NOTIF] Received hook payload:", payload);

    const { record } = payload;
    if (!record) {
      return new Response(JSON.stringify({ error: "Missing record" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");

    if (!projectId || !clientEmail || !privateKey) {
      console.warn("[NOTIF] FCM credentials environment variables missing. Skipping send.");
      return new Response(JSON.stringify({ success: false, message: "Credentials missing" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const accessToken = await getAccessToken(clientEmail, privateKey);

    // 1. Direct status transitions for the record itself
    if (record.status === "confirmed") {
      await sendStatusNotification(
        supabase,
        projectId,
        accessToken,
        record.user_id,
        "Booking Confirmed",
        "Aapki booking confirm ho gayi ✅",
        { appointmentId: record.id }
      );
    } else if (record.status === "called") {
      await sendStatusNotification(
        supabase,
        projectId,
        accessToken,
        record.user_id,
        "Your Turn",
        "Aapki baari aa gayi hai 🔔",
        { appointmentId: record.id }
      );
    } else if (record.status === "cancelled" && record.cancelled_by !== record.user_id) {
      await sendStatusNotification(
        supabase,
        projectId,
        accessToken,
        record.user_id,
        "Appointment Cancelled",
        "Aapki appointment cancel kar di gayi hai",
        { appointmentId: record.id }
      );
    }

    // 2. Queue movement trigger: recalculate waiting users
    if (
      record.center_id &&
      (record.status === "called" ||
        record.status === "completed" ||
        record.status === "no_show" ||
        record.status === "skipped")
    ) {
      const today = record.appointment_date || new Date().toISOString().split("T")[0];

      // Query current token settings for center/queue
      const { data: queueSetting } = await supabase
        .from("center_queue_settings")
        .select("current_token")
        .eq("center_id", record.center_id)
        .eq("appointment_date", today)
        .maybeSingle();

      const currentToken = queueSetting?.current_token || 0;

      // Query active appointments remaining
      const { data: waitingAppts } = await supabase
        .from("appointments")
        .select("id, user_id, token_number")
        .eq("center_id", record.center_id)
        .eq("appointment_date", today)
        .in("status", ["confirmed", "checked_in"])
        .order("token_number", { ascending: true });

      if (waitingAppts) {
        for (const appt of waitingAppts) {
          const peopleAhead = Math.max((appt.token_number || 0) - currentToken, 0);
          if (peopleAhead === 3) {
            console.log(`[NOTIF] Shifting queue: User ${appt.user_id} has exactly 3 people left.`);
            await sendStatusNotification(
              supabase,
              projectId,
              accessToken,
              appt.user_id,
              "Queue Update",
              "Bas thodi dair aur — 3 log aap se pehle hain",
              { appointmentId: appt.id }
            );
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      status: 200,
    });
  } catch (error) {
    console.error("[NOTIF] Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      status: 500,
    });
  }
});
