let cachedToken = null;
let tokenExpiry = 0;

async function getAppAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET environment variables");
  }

  const resp = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!resp.ok) {
    throw new Error(`Token request failed: ${resp.status}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  // Expire 5 minutes early to avoid edge cases
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const token = await getAppAccessToken();
    const clientId = process.env.TWITCH_CLIENT_ID;
    const channelName = "daddington77";

    const streamResp = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${channelName}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!streamResp.ok) {
      throw new Error(`Twitch API error: ${streamResp.status}`);
    }

    const streamData = await streamResp.json();
    const stream = streamData.data && streamData.data[0];

    if (stream) {
      return new Response(
        JSON.stringify({
          is_live: true,
          title: stream.title,
          game_name: stream.game_name,
          viewer_count: stream.viewer_count,
          started_at: stream.started_at,
          thumbnail_url: stream.thumbnail_url
            ? stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720")
            : null,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ is_live: false }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (error) {
    console.error("Twitch status error:", error);
    return new Response(
      JSON.stringify({ is_live: false, error: "Unable to fetch stream status" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
};

export const config = {
  path: "/.netlify/functions/twitch-status",
};
