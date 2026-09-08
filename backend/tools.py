"""Hands-busy triage tools with simulated lookup latency and fence checks.

All values are synthetic / de-identified. This is a training copilot, not a
clinical decision system.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from fence import StaleToolResult, ToolFence

DOSAGE_LOOKUP_LATENCY_S = float(os.getenv("DOSAGE_LOOKUP_LATENCY_S", "2.5"))

# Synthetic adult/pediatric reference table — NOT for real clinical use.
_SYNTHETIC_DOSAGE: dict[str, dict[str, Any]] = {
    "epinephrine": {
        "unit": "milligrams",
        "mg_per_kg": 0.01,
        "route": "intramuscular",
        "max_mg": 0.5,
        "note": "simulated anaphylaxis reference",
    },
    "epinephrine cardiac": {
        "unit": "milligrams",
        "mg_per_kg": 0.01,
        "route": "intravenous",
        "max_mg": 1.0,
        "note": "simulated cardiac arrest reference",
    },
    "naloxone": {
        "unit": "milligrams",
        "mg_per_kg": 0.01,
        "route": "intranasal or intramuscular",
        "max_mg": 2.0,
        "note": "simulated opioid reversal reference",
    },
    "midazolam": {
        "unit": "milligrams",
        "mg_per_kg": 0.1,
        "route": "intramuscular",
        "max_mg": 10.0,
        "note": "simulated seizure reference",
    },
    "ketamine": {
        "unit": "milligrams",
        "mg_per_kg": 1.0,
        "route": "intravenous",
        "max_mg": 100.0,
        "note": "simulated analgesia reference",
    },
}


def _normalize_med(name: str) -> str:
    key = name.strip().lower()
    aliases = {
        "epi": "epinephrine",
        "adrenaline": "epinephrine",
        "narcan": "naloxone",
        "versed": "midazolam",
    }
    return aliases.get(key, key)


async def lookup_dosage(
    fence: ToolFence,
    patient_weight_kg: float,
    medication: str,
    latency_s: float = DOSAGE_LOOKUP_LATENCY_S,
) -> dict[str, Any]:
    """Look up a simulated weight-based dose. Sleeps to mimic a slow DB.

    If the medic interrupts during the wait, the fence cancels this task and
    the result is never returned to the LLM.
    """
    med = _normalize_med(medication)
    payload = _SYNTHETIC_DOSAGE.get(med)
    if payload is None:
        known = ", ".join(sorted(_SYNTHETIC_DOSAGE))
        return {
            "ok": False,
            "spoken": (
                f"Um, I don't have a simulated table for {medication}. "
                f"I can look up {known}."
            ),
        }

    async def _query() -> dict[str, Any]:
        await asyncio.sleep(latency_s)
        raw = patient_weight_kg * float(payload["mg_per_kg"])
        dose = min(raw, float(payload["max_mg"]))
        return {
            "ok": True,
            "medication": med,
            "weight_kg": patient_weight_kg,
            "dose_mg": round(dose, 3),
            "route": payload["route"],
            "note": payload["note"],
            "spoken": (
                f"Right. Simulated {med} for {patient_weight_kg} kilograms is "
                f"{round(dose, 2)} milligrams {payload['route']}. "
                f"Confirm locally. This is training data only."
            ),
        }

    try:
        return await fence.run("lookup_dosage", _query())
    except asyncio.CancelledError:
        return {
            "ok": False,
            "cancelled": True,
            "spoken": "Understood. Dropping that dose lookup.",
        }
    except StaleToolResult:
        return {
            "ok": False,
            "stale": True,
            "spoken": "That old dose is gone. Tell me the weight again if you still need it.",
        }


async def protocol_step(step: str) -> dict[str, Any]:
    """Return a short spoken checklist line for a trauma/CPR protocol step."""
    scripts = {
        "scene": "Scene safe. Gloves on. Tell me if you need airway next.",
        "airway": "Open the airway. Look listen feel. Tell me what you see.",
        "breathing": "Give breaths if needed. Watch the chest rise.",
        "circulation": "Start compressions. Hard and fast. I'll keep the count if you want.",
        "disability": "Check pupils and response. Keep talking to me.",
        "exposure": "Expose to find bleeding. Keep them warm.",
        "cpr": "Compressions at 100 to 120 a minute. I'll stay quiet unless you ask.",
        "bleed": "Direct pressure. Pack the wound. Tell me when the bleeding slows.",
    }
    key = step.strip().lower()
    spoken = scripts.get(
        key,
        "Okay. Say airway, breathing, circulation, bleed, or C P R and I'll cue you.",
    )
    return {"ok": True, "step": key, "spoken": spoken}
