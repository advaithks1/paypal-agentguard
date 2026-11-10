"""Minimal Gemini REST client with structured JSON output, retries and a rate-limit cooldown.

Any failure raises GeminiUnavailable; callers then use their deterministic fallback.
The API key goes in a header (never in logs or URLs).
"""
import json
import logging
import re
import time
from typing import Any, Callable

import httpx

from app.core.config import Settings, get_settings

log = logging.getLogger("agentguard.gemini")
BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiUnavailable(Exception):
    pass


class GeminiClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None,
                 sleep: Callable[[float], None] = time.sleep, max_retries: int = 2, cooldown_seconds: float = 30.0):
        self.s = settings or get_settings()
        self._http = httpx.Client(transport=transport, timeout=httpx.Timeout(25.0, connect=8.0))
        self._sleep, self._max_retries, self._cooldown = sleep, max_retries, cooldown_seconds
        self._blocked_until = 0.0

    @property
    def available(self) -> bool:
        return self.s.gemini_configured and time.time() >= self._blocked_until

    def generate_json(self, *, system: str, prompt: str, schema: dict, max_tokens: int = 700, temperature: float = 0.2) -> dict:
        if not self.s.gemini_configured:
            raise GeminiUnavailable("GEMINI_API_KEY is not set")
        if time.time() < self._blocked_until:
            raise GeminiUnavailable("Gemini is cooling down after rate limiting")
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema, "temperature": temperature,
                                 "maxOutputTokens": max_tokens, "thinkingConfig": {"thinkingBudget": 0}},
        }
        url = f"{BASE}/{self.s.gemini_model}:generateContent"
        attempt = 0
        while True:
            try:
                r = self._http.post(url, json=body, headers={"x-goog-api-key": self.s.gemini_api_key})
            except httpx.HTTPError as e:
                if attempt < self._max_retries:
                    self._sleep(1.0 * 2 ** attempt); attempt += 1; continue
                raise GeminiUnavailable(f"network error: {type(e).__name__}") from e
            if r.status_code == 429 or r.status_code >= 500:
                if attempt < self._max_retries:
                    self._sleep(1.0 * 2 ** attempt); attempt += 1; continue
                if r.status_code == 429:
                    self._blocked_until = time.time() + self._cooldown
                raise GeminiUnavailable(f"Gemini returned {r.status_code}")
            if r.status_code >= 400:
                log.warning("Gemini request rejected: %s %s", r.status_code, r.text[:300])
                raise GeminiUnavailable(f"Gemini rejected the request ({r.status_code})")
            return self._parse(r)

    @staticmethod
    def _parse(r: httpx.Response) -> dict:
        try:
            data = r.json()
            if (data.get("promptFeedback") or {}).get("blockReason"):
                raise GeminiUnavailable("prompt blocked by Gemini safety filters")
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts).strip()
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
            out: Any = json.loads(text)
        except GeminiUnavailable:
            raise
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise GeminiUnavailable("Gemini returned an unusable response") from e
        if not isinstance(out, dict):
            raise GeminiUnavailable("Gemini did not return a JSON object")
        return out


_client: GeminiClient | None = None


def get_gemini_client() -> GeminiClient:
    global _client
    if _client is None:
        _client = GeminiClient()
    return _client
