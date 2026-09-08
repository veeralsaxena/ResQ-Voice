import { NextResponse } from "next/server";
import { configured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const livekitConfigured =
    configured(process.env.LIVEKIT_API_KEY) &&
    configured(process.env.LIVEKIT_API_SECRET) &&
    configured(url);

  return NextResponse.json({
    livekit: livekitConfigured,
    livekitUrl: url && !url.includes("your-project") ? url : null,
    rime: configured(process.env.RIME_API_KEY),
    groq: configured(process.env.GROQ_API_KEY),
    deepgram: configured(process.env.DEEPGRAM_API_KEY),
    openai: configured(process.env.OPENAI_API_KEY),
    readyForBrowserSession: livekitConfigured,
    readyForAgent:
      configured(process.env.RIME_API_KEY) &&
      (configured(process.env.GROQ_API_KEY) || configured(process.env.OPENAI_API_KEY)),
  });
}
