"""Heuristic detector for prompt-injection style text inside merchant/item/description fields.

These fields are untrusted data. This is a defence in depth: the real protection is that model
output never triggers payments and the deterministic engine always decides.
"""
import re
import unicodedata

_PATTERNS = [
    r"ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?|polic(y|ies))",
    r"disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|your)\s+(instructions?|rules?|polic(y|ies))",
    r"(system|developer)\s+prompt",
    r"you\s+are\s+now\b",
    r"\b(override|bypass|skip|disable)\s+(the\s+|all\s+|any\s+)?(polic(y|ies)|limits?|checks?|approval|guard\w*|risk)",
    r"\b(auto[- ]?approve|approve\s+(this|it|immediately)|mark\s+(this\s+)?as\s+(safe|approved|trusted))\b",
    r"\bset\s+(the\s+)?(risk|score|decision)\b",
    r"\bdo\s+not\s+(tell|alert|notify|flag)\b",
    r"</?\s*(system|assistant|instructions?)\s*>",
    r"\bjailbreak\b",
]
_COMPILED = [re.compile(p, re.IGNORECASE) for p in _PATTERNS]


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text)


_AUTO_APPROVE = _COMPILED[5]  # legitimate wording in a policy instruction ("auto approve under $25")


def find_injection(*texts: str | None, allow_auto_approve: bool = False) -> list[str]:
    """Return the matched snippets (empty list if the text looks clean)."""
    hits: list[str] = []
    for t in texts:
        if not t:
            continue
        norm = _normalize(t)
        for rx in _COMPILED:
            if allow_auto_approve and rx is _AUTO_APPROVE:
                continue
            m = rx.search(norm)
            if m:
                hits.append(m.group(0)[:60])
    return hits


def wrap_untrusted(label: str, value: str) -> str:
    """Delimit untrusted text for inclusion in an LLM prompt (used by the Gemini agents)."""
    cleaned = _normalize(value).replace("<<<", "«").replace(">>>", "»")[:500]
    return f"<<<UNTRUSTED {label}>>>{cleaned}<<<END {label}>>>"
