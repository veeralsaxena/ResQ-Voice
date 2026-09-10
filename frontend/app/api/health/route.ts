import { NextResponse } from "next/server";
import { configured } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const livekitConfigured =
    configured(process.env.LIVEKIT_API_KEY) &&
    configured(process.env.LIVEKIT_API_SECRET) &&
    configured(url);

  const rimeConfigured = configured(process.env.RIME_API_KEY);
  const groqConfigured = configured(process.env.GROQ_API_KEY);
  const openaiConfigured = configured(process.env.OPENAI_API_KEY);
  const deepgramConfigured = configured(process.env.DEEPGRAM_API_KEY);

  const llmReady = groqConfigured || openaiConfigured;
  const llmProvider = groqConfigured
    ? (process.env.GROQ_MODEL?.includes("gpt-oss") || !process.env.GROQ_MODEL ? "Groq (GPT-OSS-20B)" : `Groq (${process.env.GROQ_MODEL})`)
    : (openaiConfigured ? "OpenAI (GPT-4o-mini)" : "None");

  const sttReady = deepgramConfigured || groqConfigured || openaiConfigured;
  const sttProvider = deepgramConfigured ? "Deepgram (Nova-2)" : (groqConfigured ? "Groq Whisper" : (openaiConfigured ? "OpenAI Whisper" : "None"));

  return NextResponse.json({
    livekit: livekitConfigured,
    livekitUrl: url && !url.includes("your-project") ? url : "ws://127.0.0.1:7880",
    rime: rimeConfigured,
    rimeModel: process.env.RIME_MODEL || "mistv3",
    rimeSpeaker: process.env.RIME_SPEAKER || "astra",
    groq: groqConfigured,
    openai: openaiConfigured,
    deepgram: deepgramConfigured,
    llmReady,
    llmProvider,
    sttReady,
    sttProvider,
    readyForBrowserSession: livekitConfigured,
    readyForAgent: rimeConfigured && llmReady,
  });
}
