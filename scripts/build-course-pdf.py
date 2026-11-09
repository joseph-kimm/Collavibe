"""Render the generated course handbook with ReportLab (authoring dependency only)."""
from pathlib import Path
import os
import re
from html import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, HRFlowable

root = Path(__file__).resolve().parents[1]
font_root = Path(os.environ.get("COURSE_FONT_DIR", "/System/Library/Fonts/Supplemental"))
if (font_root / "Arial.ttf").exists():
    for name, filename in (("Course", "Arial.ttf"), ("CourseBold", "Arial Bold.ttf"), ("CourseItalic", "Arial Italic.ttf"), ("CourseBoldItalic", "Arial Bold Italic.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(font_root / filename)))
    pdfmetrics.registerFontFamily("Course", normal="Course", bold="CourseBold", italic="CourseItalic", boldItalic="CourseBoldItalic")
    regular, bold = "Course", "CourseBold"
else:
    regular, bold = "Helvetica", "Helvetica-Bold"
ink, accent = colors.HexColor("#172537"), colors.HexColor("#245783")
body = ParagraphStyle("Body", fontName=regular, fontSize=10.5, leading=15.2, textColor=ink, spaceAfter=8, splitLongWords=True)
styles = {
    1: ParagraphStyle("Title", parent=body, fontName=bold, fontSize=34, leading=40, spaceAfter=20),
    2: ParagraphStyle("Section", parent=body, fontName=bold, fontSize=20, leading=25, spaceBefore=20, spaceAfter=12, keepWithNext=True),
    3: ParagraphStyle("Subsection", parent=body, fontName=bold, fontSize=13, leading=18, spaceBefore=13, spaceAfter=7, keepWithNext=True),
    4: ParagraphStyle("Minor", parent=body, fontName=bold, fontSize=11, leading=16, spaceBefore=9, keepWithNext=True),
}
bullet = ParagraphStyle("Bullet", parent=body, leftIndent=13, firstLineIndent=-10, spaceAfter=6)
code = ParagraphStyle("Template", parent=body, fontSize=10, leading=15, leftIndent=12, rightIndent=12, backColor=colors.HexColor("#f3f6fa"), borderPadding=10, spaceBefore=10, spaceAfter=14)

def inline(text):
    text = text.replace("—", " - ").replace("–", "-").replace("\u2011", "-")
    text = escape(text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<link href="\2" color="#245783"><u>\1</u></link>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return text

story, paragraph, code_lines = [], [], []
inside_code = False
def flush():
    if paragraph:
        story.append(Paragraph(inline(" ".join(paragraph)), body))
        paragraph.clear()

handbook = (root / "public/course-kit/Course Handbook.md").read_text()
edition = re.search(r"^Teaching edition (\d+\.\d+)\.", handbook, re.MULTILINE)
for line in handbook.splitlines():
    if line.startswith("```"):
        flush()
        if inside_code:
            story.append(Paragraph("<br/>".join(inline(row) or "&#160;" for row in code_lines), code))
            code_lines.clear()
        inside_code = not inside_code
        continue
    if inside_code:
        code_lines.append(line)
        continue
    heading = re.match(r"^(#{1,4}) (.+)", line)
    if heading:
        flush()
        level, text = len(heading[1]), heading[2]
        if level == 2 and (text.startswith("Session 1:") or text in ("Assignment briefs", "Facilitator guide", "Resource catalog", "Templates")):
            story.append(PageBreak())
        story.append(Paragraph(inline(text), styles[level]))
    elif line.startswith("- "):
        flush()
        story.append(Paragraph("&#8226; " + inline(line[2:]), bullet))
    elif re.match(r"^\d+\. ", line):
        flush()
        story.append(Paragraph(inline(line), bullet))
    elif line == "---":
        flush()
        story.append(Spacer(1, 6))
    elif not line.strip():
        flush()
    else:
        paragraph.append(line)
flush()

def furniture(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d8e1eb"))
    canvas.line(50, 755, 562, 755)
    canvas.setFont(regular, 8)
    canvas.setFillColor(accent)
    canvas.drawString(50, 766, "COLLAVIBE / VIBECODE 101")
    canvas.drawString(50, 30, "Teaching edition " + edition.group(1) if edition else "Vibecode 101")
    canvas.drawRightString(562, 30, str(doc.page))
    canvas.restoreState()

output = root / "public/course-kit/Vibecode 101 - Course Handbook.pdf"
SimpleDocTemplate(str(output), pagesize=letter, leftMargin=50, rightMargin=50, topMargin=54, bottomMargin=50, title="Vibecode 101 - Complete Course Handbook", author="Collavibe").build(story, onFirstPage=furniture, onLaterPages=furniture)
print(output)
