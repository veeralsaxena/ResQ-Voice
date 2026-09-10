import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

import fs from "fs";

export const dynamic = "force-dynamic";

export async function POST() {
  const script = path.resolve(process.cwd(), "..", "backend", "tests", "benchmark_barge_in.py");
  const venvPython = path.resolve(process.cwd(), "..", ".venv", "bin", "python");
  const python = fs.existsSync(venvPython) ? venvPython : (process.platform === "win32" ? "python" : "python3");

  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(python, [script, "--trials", "3", "--json"], {
      cwd: path.resolve(process.cwd(), ".."),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout: "", stderr: String(err) }));
  });

  const start = result.stdout.indexOf("{");
  if (start === -1) {
    return NextResponse.json(
      { error: "Benchmark did not return JSON", detail: result.stderr || result.stdout },
      { status: 500 },
    );
  }
  try {
    const payload = JSON.parse(result.stdout.slice(start));
    return NextResponse.json({ ok: result.code === 0, ...payload });
  } catch {
    return NextResponse.json({ error: "Invalid benchmark JSON", detail: result.stdout }, { status: 500 });
  }
}
