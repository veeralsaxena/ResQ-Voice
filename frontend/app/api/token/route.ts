import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { configured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!configured(apiKey) || !configured(apiSecret) || !configured(url)) {
    return NextResponse.json(
      {
        error:
          "Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET. Copy ../.env.example into frontend/.env.local",
      },
      { status: 500 },
    );
  }

  const identity =
    req.nextUrl.searchParams.get("identity") ||
    `medic-${Math.random().toString(36).slice(2, 8)}`;
  const room =
    req.nextUrl.searchParams.get("room") ||
    `resq-${Math.random().toString(36).slice(2, 10)}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "1h",
    metadata: JSON.stringify({ role: "field_medic" }),
  });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url,
    roomName: room,
    identity,
    tts: {
      provider: "rime",
      model: process.env.RIME_MODEL || "mistv3",
      speaker: process.env.RIME_SPEAKER || "astra",
      transport: "webrtc",
    },
  });
}
