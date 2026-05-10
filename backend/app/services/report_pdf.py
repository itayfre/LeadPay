"""
PDF renderer — converts a report payload dict into PDF bytes using
WeasyPrint + Jinja2. The same template is used for local dev and Railway.
Fonts are bundled in app/static/fonts/ so no network access is needed.
"""
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

_BASE = Path(__file__).resolve().parent.parent
_TEMPLATES = _BASE / "templates"
_FONTS = _BASE / "static" / "fonts"

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES)),
    autoescape=select_autoescape(["html", "xml"]),
)


def render_report_pdf(payload: dict) -> bytes:
    template = _env.get_template("report.html.j2")
    html_str = template.render(payload=payload, font_dir=str(_FONTS))
    return HTML(string=html_str, base_url=str(_BASE)).write_pdf()
