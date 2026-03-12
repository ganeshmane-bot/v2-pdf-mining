# api/extract.py
# ══════════════════════════════════════════════════
# Receives page texts from the browser, calls OpenAI
# once, returns a JSON array of product rows.
# Text-only — no images, no Drive, no complexity.
# Fits comfortably within Vercel's 60s limit.
# ══════════════════════════════════════════════════

import os, json, traceback
from http.server import BaseHTTPRequestHandler
from openai import OpenAI

# ── Column schema per category ──────────────────────────────
# These become the CSV headers OpenAI must populate.

COLUMNS = {
    "default": [
        "page_no", "product_code", "product_name", "size",
        "material", "finish", "color_family", "texture_type",
        "collection", "brand", "serial_no", "notes",
    ],
    "tiles": [
        "page_no", "product_code", "product_name", "size",
        "finish", "material", "color_family", "texture_type",
        "collection", "brand", "thickness", "surface_area", "notes",
    ],
    "laminates": [
        "page_no", "product_code", "product_name", "size",
        "thickness", "finish", "material", "color_family",
        "texture_type", "collection", "brand", "notes",
    ],
    "panels": [
        "page_no", "product_code", "product_name", "size",
        "finish", "material", "color_family", "texture_type",
        "thickness", "collection", "brand", "application", "notes",
    ],
    "louvers": [
        "page_no", "product_code", "product_name", "size",
        "profile", "finish", "material", "color_family",
        "collection", "brand", "application", "notes",
    ],
    "wallpapers": [
        "page_no", "product_code", "product_name", "size",
        "finish", "material", "color_family", "pattern_type",
        "collection", "brand", "notes",
    ],
    "quartz": [
        "page_no", "product_code", "product_name", "size",
        "finish", "color_family", "thickness",
        "collection", "brand", "edge_profile", "notes",
    ],
}


def build_prompt(category, columns, pages):
    cols_str  = ", ".join(columns)
    pages_str = ""
    for p in pages:
        pages_str += f"\n\n--- PAGE {p['page_no']} ---\n{p['text'][:3000]}"

    return f"""You are extracting product data from a building materials catalogue ({category}).
Analyse all pages below and return ONLY a JSON object with a "products" array.

Each product must have EXACTLY these fields (use "" for unknown values):
{cols_str}

RULES:
1. Only include pages that contain actual product listings with a product code.
2. Skip: cover pages, index pages, application/room photos, brand story pages, spec-only pages with no product code.
3. product_code must be the exact code printed (e.g. LPR-514, TL-2201, WP-38). Skip if no code found.
4. size = full dimension string as printed (e.g. "2400 x 1200 MM", "600 x 600 MM").
5. If one page has multiple products, return one row per product.
6. Keep all values concise — one line per field.
7. Return ONLY valid JSON. No markdown. No explanation.

PAGE TEXTS:
{pages_str}
"""


def extract(ai, category, columns, pages, model):
    prompt = build_prompt(category, columns, pages)
    resp = ai.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "Return only valid JSON with a 'products' array. No markdown."},
            {"role": "user",   "content": prompt},
        ],
        timeout=45,
    )
    raw = resp.choices[0].message.content
    data = json.loads(raw)
    return data.get("products", [])


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length))

        category   = (body.get("category") or "default").lower().strip()
        pages      = body.get("pages") or []
        model      = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        ai         = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

        columns    = COLUMNS.get(category, COLUMNS["default"])

        # If PDF is very long, split into chunks of 30 pages and merge
        CHUNK = 30
        all_products = []

        try:
            if len(pages) <= CHUNK:
                all_products = extract(ai, category, columns, pages, model)
            else:
                for i in range(0, len(pages), CHUNK):
                    chunk = pages[i : i + CHUNK]
                    chunk_result = extract(ai, category, columns, chunk, model)
                    all_products.extend(chunk_result)

            return self._send(200, {"products": all_products, "count": len(all_products)})

        except Exception as e:
            return self._send(500, {"error": str(e), "trace": traceback.format_exc()})

    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type",  "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)
