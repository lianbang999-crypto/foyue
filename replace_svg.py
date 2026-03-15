import base64
with open("icons/temp-120.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")
svg_str = f"      <svg class=\"loader-logo\" width=\"120\" height=\"120\" viewBox=\"0 0 120 120\" style=\"opacity:.6;animation:breathe 2.5s ease-in-out infinite\">\n        <image href=\"data:image/png;base64,{b64}\" width=\"120\" height=\"120\" preserveAspectRatio=\"xMidYMid meet\" />\n      </svg>"
with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()
old_svg = "      <svg class=\"loader-logo\" width=\"120\" height=\"120\" viewBox=\"0 0 512 512\" style=\"opacity:.4;animation:breathe 2.5s ease-in-out infinite\">\n        <circle cx=\"256\" cy=\"256\" r=\"200\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"8\" opacity=\"0.2\"/>\n        <path d=\"M256 100 L256 256 L350 350\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"12\" stroke-linecap=\"round\"/>\n      </svg>"
updated = content.replace(old_svg, svg_str)
with open("index.html", "w", encoding="utf-8") as f:
             pdat             pdat             pdat  ex.html")
