# test.py
import datetime
import logging
import uuid
from functools import wraps
from collections import defaultdict
from typing import Optional, Dict, Any, Callable
import html
import unicodedata

import json
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, parse_qs
from mcp.server.fastmcp import FastMCP

class Utf8FastMCP(FastMCP):
    def _json_dumps(self, obj):
        # Fallback: if FastMCP 沒有這個方法，你可以在它實際呼叫的地方找對應名稱覆寫
        return json.dumps(obj, ensure_ascii=False)

# use this instead of FastMCP(...)
mcp = Utf8FastMCP("ProductMCP")

# ===================== Logging =====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler("mcp_calls.log")],
)

mcp = FastMCP("ProductMCP")
CALL_COUNTS = defaultdict(int)
LAST_USED = {}

def log_calls(tool_name: str):
    def deco(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            rid = str(uuid.uuid4())
            ts = datetime.datetime.now().isoformat()
            logging.info(f"[CALL START] tool={tool_name} id={rid} args={args} kwargs={kwargs}")
            CALL_COUNTS[tool_name] += 1
            LAST_USED[tool_name] = ts
            try:
                out = func(*args, **kwargs)
                if isinstance(out, dict):
                    out.setdefault("_mcp_audit", {"tool": tool_name, "request_id": rid, "ts": ts})
                logging.info(f"[CALL END]   tool={tool_name} id={rid} status=ok")
                return out
            except Exception as e:
                logging.exception(f"[CALL ERROR] tool={tool_name} id={rid} error={e}")
                return {"error": str(e), "_mcp_audit": {"tool": tool_name, "request_id": rid, "ts": ts}}
        return wrapper
    return deco

# ===================== Helpers =====================
def clean_text(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    return re.sub(r"\s+", " ", s).strip()

def to_float_maybe(x: Any) -> Optional[float]:
    if x is None:
        return None
    try:
        return float(x)
    except Exception:
        try:
            return float(re.sub(r"[^\d.]", "", str(x)))
        except Exception:
            return None

def find_price_generic(soup: BeautifulSoup) -> Optional[float]:
    # 1) JSON-LD offers.price
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict):
                offers = item.get("offers")
                if isinstance(offers, dict):
                    price = offers.get("price") or offers.get("priceSpecification", {}).get("price")
                    f = to_float_maybe(price)
                    if f is not None:
                        return f
                if isinstance(offers, list):
                    for o in offers:
                        if isinstance(o, dict):
                            price = o.get("price") or o.get("priceSpecification", {}).get("price")
                            f = to_float_maybe(price)
                            if f is not None:
                                return f
    # 2) Meta tags commonly used
    meta_price = soup.find("meta", {"property": "product:price:amount"}) or soup.find("meta", {"name": "price"})
    if meta_price and meta_price.get("content"):
        f = to_float_maybe(meta_price["content"])
        if f is not None:
            return f
    # 3) Text fallback: $ 123.45 / NT$ 3,290 / USD 199
    text = soup.get_text(" ", strip=True)
    for pat in [
        r"\bUSD\s*\$?\s*([\d,]+(?:\.\d{1,2})?)",
        r"\$\s*([\d,]+(?:\.\d{1,2})?)",
        r"\bNT\$?\s*([\d,]+(?:\.\d{1,2})?)",
        r"\bTWD\s*([\d,]+(?:\.\d{1,2})?)",
        r"\bEUR\s*\€?\s*([\d\.]+)",
    ]:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            try:
                return float(m.group(1).replace(",", ""))
            except Exception:
                continue
    return None

DIM_PATTERNS = [
    (re.compile(r'(\d)\s*"\b'), r'\1″'),       # 1" -> 1″
    (re.compile(r'(\d)\s*\'\b'), r'\1′'),      # 1' -> 1′
    (re.compile(r'\\"'), '″'),                 # \" -> ″
]

def normalize_for_output(text: Optional[str]) -> Optional[str]:
    """Normalize strings for safe JSON transport and your pipeline:
       - HTML unescape (&Oslash; -> Ø)
       - Unicode NFC normalization
       - Replace ASCII inch/foot to proper symbols (″, ′)
       - Remove backslashes
       - Replace plain double quotes with typographic double quotes to avoid escaping
    """
    if text is None:
        return None
    # HTML entities & stray \uXXXX in source text
    t = html.unescape(text)
    # Unicode normalize
    t = unicodedata.normalize("NFC", t)

    # Dimension/inch/foot cleanups
    for pat, repl in DIM_PATTERNS:
        t = pat.sub(repl, t)

    # Remove backslashes entirely (common cause of \" in scraped text)
    t = t.replace("\\", "")

    # Replace plain double quote with typographic double quote
    # so JSON serializers don't need to escape it inside strings
    t = t.replace('"', '”')  # U+201D

    # Collapse whitespace
    t = re.sub(r"\s+", " ", t).strip()
    return t

def sanitize_output_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Apply normalize_for_output to all string fields we return."""
    out = dict(data)
    for key in ("name", "brand", "model", "spec"):
        if key in out:
            out[key] = normalize_for_output(out[key]) if isinstance(out[key], str) else out[key]
    return out
# ===================== Site-specific parsers =====================
class SiteParser:
    def can_handle(self, url: str, soup: BeautifulSoup) -> bool:
        raise NotImplementedError
    def parse(self, url: str, soup: BeautifulSoup) -> Dict[str, Any]:
        raise NotImplementedError

class ThorlabsParser(SiteParser):
    BRAND = "Thorlabs"

    def can_handle(self, url: str, soup: BeautifulSoup) -> bool:
        host = urlparse(url).netloc.lower()
        return "thorlabs.com" in host and "thorproduct.cfm" in url.lower()

    def parse(self, url: str, soup: BeautifulSoup) -> Dict[str, Any]:
        """
        Rules:
        - brand = Thorlabs
        - model = query param 'partnumber'
        - title pattern: "Thorlabs - {MODEL} {NAME}, {SPEC...}"
          -> name = token(s) after MODEL until first comma
          -> spec = the rest after the first comma
        - price: generic finder
        """
        brand = self.BRAND

        # model from URL
        qs = parse_qs(urlparse(url).query)
        model = (qs.get("partnumber", [None])[0] or "").strip() or None

        # title or og:title
        title_tag = soup.find("title")
        title_text = clean_text(title_tag.get_text()) if title_tag else None
        if not title_text:
            og = soup.find("meta", property="og:title")
            if og and og.get("content"):
                title_text = clean_text(og["content"])

        name = None
        spec = None
        if title_text:
            # Remove leading "Thorlabs - "
            title_text = re.sub(r"^\s*Thorlabs\s*-\s*", "", title_text, flags=re.IGNORECASE).strip()

            # If we already know the model and the title starts with it, strip it out
            tail = title_text
            if model and title_text.upper().startswith(model.upper()):
                tail = title_text[len(model):].strip()
                tail = re.sub(r'^[\s\-–—:,]+', '', tail)

            # If model unknown, try to detect it inside the title (e.g., PAX1000VIS / AYL108-B)
            if not model:
                m = re.search(r"\b([A-Z0-9]{1,6}(?:-[A-Z0-9]+)*)\b", title_text)
                if m:
                    model = m.group(1)
                    # remove it from tail
                    tail = re.sub(rf"\b{re.escape(model)}\b", "", title_text).strip()
                    tail = re.sub(r'^[\s\-–—:,]+', '', tail)

            # Now split tail at the first comma => name, spec
            parts = [p.strip() for p in tail.split(",")]
            if parts:
                name = parts[0] or None
                # Sometimes name may include extra tokens like "Controller" etc. That's fine.
                spec = ", ".join(parts[1:]) if len(parts) > 1 else None

        price = find_price_generic(soup)

        # If still no name, try H1
        if not name:
            h1 = soup.find("h1")
            if h1:
                name = clean_text(h1.get_text())

        # Final normalization
        clean = sanitize_output_fields({
            "name": name,
            "brand": brand,
            "model": model,
            "price": price,
            "spec": spec
        })
        return clean

# Register more site parsers here in the future, e.g. AmazonParser, MomoParser, etc.
SITE_PARSERS: list[SiteParser] = [
    ThorlabsParser(),
]

# ===================== Generic fallback =====================
def generic_parse(url: str, soup: BeautifulSoup) -> Dict[str, Any]:
    # name
    name = None
    title = soup.find("title")
    if title:
        name = clean_text(title.get_text())

    # brand
    brand = None
    for key in ("brand", "product:brand", "og:brand"):
        tag = soup.find("meta", {"name": key}) or soup.find("meta", {"property": key})
        if tag and tag.get("content"):
            brand = clean_text(tag["content"])
            break

    # model (from json-ld or text)
    model = None
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "")
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict) and str(item.get("@type", "")).lower() in {"product", "individualproduct"}:
                candidate = item.get("mpn") or item.get("model") or item.get("sku")
                candidate = clean_text(candidate)
                if candidate:
                    model = candidate
                    break

    if not model:
        text = soup.get_text(" ", strip=True)
        m = re.search(r"(?:model|型號)[:：]?\s*([A-Za-z0-9\-_\.]{2,40})", text, flags=re.I)
        if m:
            model = m.group(1).strip()

    # price + spec (spec text from spec-like sections)
    price = find_price_generic(soup)

    spec = None
    keywords = ["spec", "specification", "specifications", "規格", "技術規格", "產品規格"]
    for h in soup.find_all(re.compile(r"^h[1-6]$")):
        if any(k in h.get_text().lower() for k in keywords):
            # collect a few following blocks
            buf = []
            sib = h.find_next_sibling()
            for _ in range(6):
                if not sib:
                    break
                if sib.name in ("table", "dl", "ul", "ol", "div", "p"):
                    txt = clean_text(sib.get_text())
                    if txt:
                        buf.append(txt)
                sib = sib.find_next_sibling()
            if buf:
                spec = "\n".join(buf)
                break
    clean = sanitize_output_fields({
        "name": name, "brand": brand, "model": model, "price": price, "spec": spec
    })
    return clean

# ===================== Tools =====================
@log_calls("analyze_product_page")
@mcp.tool()
def analyze_product_page(url: str) -> dict:
    """
    Returns:
    {
      "name": string | None,
      "brand": string | None,
      "model": string | None,
      "price": float | None,
      "spec": string | None
    }
    """
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0 (compatible; ProductMCP/1.0)"})
        resp.raise_for_status()
    except Exception as e:
        return {"error": f"Failed to fetch page: {e}"}

    soup = BeautifulSoup(resp.text, "html.parser")

    # 1) site-specific handlers
    for parser in SITE_PARSERS:
        if parser.can_handle(url, soup):
            data = parser.parse(url, soup)
            # Ensure shape
            return {
                "name": data.get("name"),
                "brand": data.get("brand"),
                "model": data.get("model"),
                "price": data.get("price"),
                "spec": data.get("spec"),
            }

    # 2) generic fallback
    data = generic_parse(url, soup)
    return {
        "name": data.get("name"),
        "brand": data.get("brand"),
        "model": data.get("model"),
        "price": data.get("price"),
        "spec": data.get("spec"),
    }

@log_calls("get_tool_usage")
@mcp.tool()
def get_tool_usage() -> dict:
    """Return basic usage stats for all tools."""
    return {
        "counts": dict(CALL_COUNTS),
        "last_used": dict(LAST_USED),
        "server_time": datetime.datetime.now().isoformat(),
    }

# ===================== Entry =====================
if __name__ == "__main__":
    logging.info("Starting MCP server (stdio transport).")
    mcp.run(transport="stdio")
    print("MCP server is running. Use Ctrl+C to stop.")
