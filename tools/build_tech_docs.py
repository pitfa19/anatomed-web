"""
Generate the LUMEN Development 2025./2026. tehnička dokumentacija PDF for Anatom3D.
Run with the venv that has reportlab:

    /Users/pitfa19/Documents/Anatom3d/tools/.venv/bin/python tools/build_tech_docs.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


# ---------------------------------------------------------------------------
# Fonts — register a Unicode-capable family so Croatian diacritics render
# correctly. Prefer DejaVu Sans (Linux), fall back to macOS Arial.
# ---------------------------------------------------------------------------

def register_font_family() -> tuple[str, str]:
    """Register the body/mono font families. Returns (sans, mono) names."""
    candidates_sans = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf",
         "DejaVuSans"),
        ("/Library/Fonts/Arial.ttf",
         "/Library/Fonts/Arial Bold.ttf",
         "/Library/Fonts/Arial Italic.ttf",
         "/Library/Fonts/Arial Bold Italic.ttf",
         "Arial"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
         "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf",
         "Arial"),
    ]
    candidates_mono = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
         "DejaVuSansMono"),
        ("/System/Library/Fonts/Menlo.ttc", None, None),  # ttc tricky, skip
        ("/System/Library/Fonts/Supplemental/Courier New.ttf",
         "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
         "CourierNew"),
    ]

    sans_name = None
    for reg, bold, italic, bolditalic, name in candidates_sans:
        if not Path(reg).exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, reg))
            if bold and Path(bold).exists():
                pdfmetrics.registerFont(TTFont(name + "-Bold", bold))
            if italic and Path(italic).exists():
                pdfmetrics.registerFont(TTFont(name + "-Oblique", italic))
            if bolditalic and Path(bolditalic).exists():
                pdfmetrics.registerFont(TTFont(name + "-BoldOblique", bolditalic))
            pdfmetrics.registerFontFamily(
                name,
                normal=name,
                bold=name + "-Bold",
                italic=name + "-Oblique",
                boldItalic=name + "-BoldOblique",
            )
            sans_name = name
            break
        except Exception:
            continue
    if not sans_name:
        # Fallback to built-in Helvetica (Type 1, WinAnsi — does cover
        # Croatian diacritics via WinAnsiEncoding).
        sans_name = "Helvetica"

    mono_name = None
    for reg, bold, name in candidates_mono:
        if name is None or not Path(reg).exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, reg))
            if bold and Path(bold).exists():
                pdfmetrics.registerFont(TTFont(name + "-Bold", bold))
                pdfmetrics.registerFontFamily(name, normal=name, bold=name + "-Bold")
            mono_name = name
            break
        except Exception:
            continue
    if not mono_name:
        mono_name = "Courier"

    return sans_name, mono_name


SANS, MONO = register_font_family()


# ---------------------------------------------------------------------------
# Visual identity
# ---------------------------------------------------------------------------

ACCENT = colors.HexColor("#1F4E79")
ACCENT_LIGHT = colors.HexColor("#2E72B5")
SOFT_GREY = colors.HexColor("#E5E7EB")
TEXT_MUTED = colors.HexColor("#52606D")
TEXT_BODY = colors.HexColor("#1F2937")
CODE_BG = colors.HexColor("#F3F4F6")


# ---------------------------------------------------------------------------
# Page template — header divider + footer page number
# ---------------------------------------------------------------------------

def draw_chrome(canvas, doc):
    canvas.saveState()
    width, height = A4
    # Header divider line
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(0.6)
    canvas.line(2 * cm, height - 1.6 * cm, width - 2 * cm, height - 1.6 * cm)
    # Header text
    canvas.setFont(SANS, 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(2 * cm, height - 1.3 * cm, "Anatom3D · Tehnička dokumentacija")
    canvas.drawRightString(
        width - 2 * cm, height - 1.3 * cm, "LUMEN Development 2025./2026."
    )
    # Footer page number
    canvas.setFont(SANS, 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawCentredString(width / 2.0, 1.1 * cm, f"Stranica {doc.page}")
    canvas.restoreState()


def make_doc(path: str) -> BaseDocTemplate:
    doc = BaseDocTemplate(
        path,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=1.8 * cm,
        title="Anatom3D — Tehnička dokumentacija",
        author="Tim Slavonci",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
        id="main",
    )
    template = PageTemplate(id="main", frames=[frame], onPage=draw_chrome)
    cover = PageTemplate(id="cover", frames=[frame])
    doc.addPageTemplates([cover, template])
    return doc


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

styles = getSampleStyleSheet()
S_TITLE = ParagraphStyle(
    "Title",
    fontName=SANS + "-Bold" if SANS != "Helvetica" else "Helvetica-Bold",
    fontSize=26,
    leading=30,
    alignment=TA_LEFT,
    textColor=ACCENT,
    spaceAfter=8,
)
S_SUBTITLE = ParagraphStyle(
    "Subtitle",
    fontName=SANS,
    fontSize=13,
    leading=17,
    textColor=TEXT_BODY,
    spaceAfter=6,
)
S_COVERSMALL = ParagraphStyle(
    "CoverSmall",
    fontName=SANS,
    fontSize=10,
    leading=14,
    textColor=TEXT_MUTED,
)
S_H1 = ParagraphStyle(
    "H1",
    fontName=SANS + "-Bold" if SANS != "Helvetica" else "Helvetica-Bold",
    fontSize=16,
    leading=20,
    textColor=ACCENT,
    spaceBefore=16,
    spaceAfter=8,
)
S_H2 = ParagraphStyle(
    "H2",
    fontName=SANS + "-Bold" if SANS != "Helvetica" else "Helvetica-Bold",
    fontSize=12,
    leading=16,
    textColor=ACCENT_LIGHT,
    spaceBefore=10,
    spaceAfter=4,
)
S_BODY = ParagraphStyle(
    "Body",
    fontName=SANS,
    fontSize=10,
    leading=14,
    textColor=TEXT_BODY,
    alignment=TA_JUSTIFY,
    spaceAfter=6,
)
S_BODY_TIGHT = ParagraphStyle(
    "BodyTight",
    parent=S_BODY,
    spaceAfter=2,
)
S_BULLET = ParagraphStyle(
    "Bullet",
    parent=S_BODY,
    leftIndent=14,
    bulletIndent=4,
    spaceAfter=2,
    alignment=TA_LEFT,
)
S_CODE = ParagraphStyle(
    "Code",
    fontName=MONO,
    fontSize=8.5,
    leading=11,
    textColor=TEXT_BODY,
    backColor=CODE_BG,
    borderPadding=(6, 6, 6, 6),
    leftIndent=0,
    rightIndent=0,
    spaceBefore=4,
    spaceAfter=8,
)
S_CAPTION = ParagraphStyle(
    "Caption",
    fontName=SANS,
    fontSize=8.5,
    leading=11,
    textColor=TEXT_MUTED,
    alignment=TA_CENTER,
    spaceAfter=10,
)


def P(text: str, style=S_BODY) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str) -> Paragraph:
    return Paragraph(text, S_BULLET, bulletText="•")


def code_block(text: str) -> Preformatted:
    return Preformatted(text, S_CODE)


def section(num: str, title: str):
    return Paragraph(f"{num} &nbsp;&nbsp;{title}", S_H1)


def subsection(num: str, title: str):
    return Paragraph(f"{num} &nbsp;&nbsp;{title}", S_H2)


# ---------------------------------------------------------------------------
# Document body
# ---------------------------------------------------------------------------

def build_story():
    s: list = []

    # ---------- COVER ----------
    s.append(Spacer(1, 4 * cm))
    s.append(Paragraph("Anatom3D", S_TITLE))
    s.append(Paragraph("Tehnička dokumentacija", S_SUBTITLE))
    s.append(Spacer(1, 0.6 * cm))
    s.append(
        Paragraph(
            "Interaktivna platforma za učenje anatomije s 3D atlasom, "
            "AI tutorom i pametnim ponavljanjem.",
            ParagraphStyle("CoverLead", parent=S_BODY, fontSize=11, leading=15,
                           textColor=TEXT_MUTED),
        )
    )
    s.append(Spacer(1, 3 * cm))

    cover_table = Table(
        [
            ["Natjecanje:", "LUMEN Development 2025./2026."],
            ["Tim:", "Slavonci"],
            ["Članovi:",
             "Frane Andrić, Jakov Balen, Lovro Blagić, Fabijan Pitlović"],
            ["Dokument:", "Tehnička dokumentacija"],
            ["Verzija:", "1.0"],
            ["Datum:", "svibanj 2026."],
        ],
        colWidths=[3.6 * cm, 11.5 * cm],
    )
    cover_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1),
                 SANS + "-Bold" if SANS != "Helvetica" else "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), SANS),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (0, -1), ACCENT),
                ("TEXTCOLOR", (1, 0), (1, -1), TEXT_BODY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, ACCENT),
                ("LINEBELOW", (0, -1), (-1, -1), 0.6, ACCENT),
            ]
        )
    )
    s.append(cover_table)
    s.append(Spacer(1, 4 * cm))
    s.append(
        Paragraph(
            "Aplikacija se temelji na otvorenom 3D modelu <b>Z-Anatomy</b> "
            "(licenca CC&nbsp;BY-SA&nbsp;4.0, autor Luis&nbsp;P.).",
            S_COVERSMALL,
        )
    )
    s.append(PageBreak())

    # ---------- 1. SAŽETAK ----------
    s.append(section("1.", "Sažetak rješenja"))
    s.append(P(
        "<b>Anatom3D</b> je web aplikacija za studente medicine koja na "
        "jednom mjestu objedinjuje tri stupa učenja anatomije: "
        "(a) interaktivni 3D atlas izgrađen nad Z-Anatomy modelom, "
        "(b) indeksirane skripte (Skripta A1/A2/A3, Hand-Out A1, Duale Reihe) "
        "s pretragom i deep-link navigacijom na konkretnu stranicu, te "
        "(c) AI asistenta koji odgovara na hrvatskom standardnom jeziku, "
        "citira pronađene izvore i u chatu može renderirati 3D vizualizacije."
    ))
    s.append(P(
        "Aplikacija je izgrađena kao single-page React 19 + Vite 8 SPA, "
        "hostana na <b>Vercel</b> platformi. Pozivi prema Anthropic API-ju "
        "(Claude Sonnet 4.6 i Haiku 4.5) idu kroz dvije Vercel Funkcije "
        "(<font face='%s'>/api/agent/chat</font> i "
        "<font face='%s'>/api/decks/generate</font>), čime se API ključ ne "
        "izlaže u pregledniku. Korisnički podaci, kupljeni krediti i "
        "datoteke pohranjuju se u Supabase (Postgres + Storage). "
        "Studentska literatura (privatni PDF-ovi) indeksira se u pregledniku "
        "preko PDF.js-a i pohranjuje u IndexedDB, s opcionalnom sinkronizacijom "
        "u privatni Supabase bucket pri prijavi." % (MONO, MONO)
    ))
    s.append(P(
        "Dokument opisuje aktualno stanje implementacije nakon hackathon "
        "razvojnog ciklusa. Funkcionalnosti koje su <i>planirane</i> ali još "
        "nisu spojene u produkciju izričito su označene oznakom "
        "<b>(planirano)</b> kako bi žiri imao točan uvid u domet rješenja."
    ))

    # ---------- 2. TEHNOLOGIJA ----------
    s.append(section("2.", "Tehnologija i razvojni okvir"))

    s.append(subsection("2.1.", "Frontend"))
    tech_fe = [
        ["Sloj", "Tehnologija", "Verzija"],
        ["Jezik", "TypeScript", "~6.0"],
        ["UI okvir", "React", "19.2"],
        ["Build / dev server", "Vite", "8.0"],
        ["Routing", "react-router-dom", "7.14"],
        ["Stilizacija", "Tailwind CSS (+ @tailwindcss/vite)", "4.2"],
        ["Animacije", "motion (Framer Motion v12)", "12.38"],
        ["Ikone", "lucide-react", "1.11"],
        ["Markdown render", "react-markdown + remark-gfm", "10.1 / 4.0"],
    ]
    s.append(tech_table(tech_fe))

    s.append(subsection("2.2.", "Backend (Vercel Functions)"))
    s.append(P(
        "Backend nije zaseban server — riječ je o dvije serverless funkcije u "
        "direktoriju <font face='%s'>api/</font>, izvršavaju se u Vercel "
        "Fluid Compute Node.js runtimeu (zadana verzija Node.js 24 LTS). "
        "Obje su tankih ~40 redaka i imaju jedinu odgovornost: prosljeđivati "
        "zahtjeve Anthropic API-ju s ključem koji nikad ne napušta server."
        % MONO
    ))
    s.append(bullet(
        "<b>/api/agent/chat</b> — prosljeđivač za "
        "<font face='%s'>messages.create</font>; max 60 s, podržava tool "
        "use (multi-turn agentic petlja se vrti u browseru, svaki korak je "
        "jedan POST)." % MONO))
    s.append(bullet(
        "<b>/api/decks/generate</b> — generira JSON niz pitanja/odgovora "
        "modelom Claude Haiku 4.5 za proizvoljnu temu (do 20 kartica)."))

    s.append(subsection("2.3.", "Baza podataka"))
    s.append(P(
        "Koristi se <b>Supabase</b> (managed Postgres + Storage + REST). "
        "Projekt: <font face='%s'>anatom3d</font> (regija eu-west-1). "
        "Definirane su dvije tablice s permissivnim RLS politikama "
        "(hackathon-grade — vidi §7):" % MONO
    ))
    s.append(bullet(
        "<b>users</b>: <font face='%s'>id&nbsp;uuid&nbsp;PK, username&nbsp;text&nbsp;UNIQUE, "
        "password_hash&nbsp;text, credits&nbsp;int, created_at&nbsp;timestamptz</font>." % MONO))
    s.append(bullet(
        "<b>user_pdfs</b>: meta-zapis za svaku korisničku skriptu "
        "(<font face='%s'>user_id, slug, doc_label, total_pages, payload&nbsp;jsonb, "
        "pdf_path, spans_path</font>), UNIQUE (user_id, slug)." % MONO))
    s.append(P(
        "Storage je organiziran u 4 bucketa: <b>pdfs</b> (5 javnih izvornih "
        "PDF-ova), <b>pdfs-rendered</b> (WebP renderi i JSON span datoteke "
        "po stranici), <b>thumbs</b> (sličice 3D dijelova) — sva tri javna; te "
        "<b>user-pdfs</b> (privatni, namespace <font face='%s'>&lt;user_id&gt;/&lt;slug&gt;.pdf</font>)."
        % MONO
    ))

    s.append(subsection("2.4.", "AI infrastruktura"))
    s.append(P(
        "Pružatelj LLM-a: <b>Anthropic</b>, oficijelni "
        "<font face='%s'>@anthropic-ai/sdk</font> v0.91. Aplikacija ne koristi "
        "Vercel AI SDK niti AI Gateway (svjesna odluka — direktna kontrola nad "
        "tool-use formatom)." % MONO
    ))
    models_table = [
        ["Model", "Uloga", "Pozivi"],
        ["claude-sonnet-4-6", "AI tutor — odgovara studentu i odlučuje o pozivima alata",
         "/api/agent/chat (sinkrono, do 5 tool iteracija po poruci)"],
        ["claude-haiku-4-5", "Sažimanje rolling-window konteksta + generator decka",
         "klijent (sažetak, ne-blokirajuće) i /api/decks/generate"],
    ]
    s.append(tech_table(models_table, col_widths=[4.4 * cm, 5.0 * cm, 7.7 * cm]))
    s.append(P(
        "<b>Token-knjigovodstvo i krediti.</b> Svaki korisnik u tablici "
        "<font face='%s'>users</font> ima brojač <font face='%s'>credits</font>. "
        "Demo paketi (2&nbsp;€ → 20 kredita, 5&nbsp;€ → 60, 10&nbsp;€ → 150) "
        "dodaju kredite kroz funkciju <font face='%s'>addCredits()</font> "
        "(<font face='%s'>src/lib/auth.ts</font>). Stvarno pretvaranje kredita "
        "u tokene i odbijanje po API odgovoru je <b>planirano</b> za stage "
        "monetizacije — trenutačno je AI besplatno korištenje za demonstrirati "
        "UX." % (MONO, MONO, MONO, MONO)
    ))

    s.append(subsection("2.5.", "3D renderiranje"))
    tech_3d = [
        ["Sloj", "Biblioteka", "Verzija"],
        ["WebGL render", "three.js", "0.169"],
        ["React integration", "@react-three/fiber", "9.1"],
        ["Helpers (OrbitControls, Bounds, Html, useGLTF)",
         "@react-three/drei", "10.4"],
        ["Asset format", "binary glTF (.glb), kompresija meshopt",
         "—"],
    ]
    s.append(tech_table(tech_3d))
    s.append(P(
        "Modeli su pripremljeni u 8 zasebnih GLB datoteka po anatomskom "
        "sustavu (<font face='%s'>skeleton.glb</font>, "
        "<font face='%s'>muscles.glb</font>, "
        "<font face='%s'>nerves.glb</font>, vessels, organs, joints, "
        "insertions, regions). FBX → GLB konverzija radi se Blender Python "
        "skriptom <font face='%s'>tools/export_to_glb.py</font> (u "
        "Unity-companion repozitoriju), koja također sanitizira pokvarene "
        "transformacije i piše katalog dijelova "
        "(<font face='%s'>parts-catalog.json</font>) i mapu susjeda "
        "(<font face='%s'>parts-neighbors.json</font>)." %
        (MONO, MONO, MONO, MONO, MONO, MONO)
    ))

    s.append(subsection("2.6.", "Vanjske biblioteke i ovisnosti"))
    deps = [
        ["Paket", "Verzija", "Uloga"],
        ["@anthropic-ai/sdk", "0.91", "Klijent za Claude API"],
        ["@supabase/supabase-js", "2.105", "Postgres + Storage klijent"],
        ["pdfjs-dist", "5.4", "Klijentsko parsiranje + render PDF-ova"],
        ["react-pdf", "10.4", "PDF view komponenta (alt. način prikaza)"],
        ["react-markdown + remark-gfm", "10.1 / 4.0",
         "Render odgovora chata (tablice, linkovi, code blocks)"],
        ["clsx", "2.1", "Konstrukcija classNames"],
        ["@vercel/config", "0.3", "Tipovi za vercel.ts konfiguraciju"],
    ]
    s.append(tech_table(deps, col_widths=[4.6 * cm, 2.6 * cm, 9.9 * cm]))

    # ---------- 3. ARHITEKTURA ----------
    s.append(section("3.", "Arhitektura sustava"))
    s.append(P(
        "Sustav prati klasičan <b>Jamstack + serverless backend-for-frontend</b> "
        "obrazac. Klijent (React SPA) je glavna izvedbena površina; sav "
        "stateful rad obavlja se ili u pregledniku (localStorage / IndexedDB) "
        "ili u Supabase backendu. Vercel Funkcije služe samo kao tanki proxy "
        "prema Anthropic API-ju, čuvajući API ključ izvan klijenta."
    ))
    s.append(P("Dijagram blokova prikazuje tijek podataka:", S_BODY_TIGHT))
    s.append(code_block(diagram_text()))
    s.append(P(
        "<b>Tijek (a) — student rotira 3D model.</b> Ulazak na "
        "<font face='%s'>/viewer</font> učitava "
        "<font face='%s'>parts-catalog.json</font> (~150 KB). Pri pretrazi "
        "ili klikom na dio, klijent dohvaća odgovarajući "
        "<font face='%s'>&lt;system&gt;.glb</font> iz "
        "<font face='%s'>public/models/glb/</font> (CDN-cached na Vercelu). "
        "Algoritam <font face='%s'>applyIsolation()</font> (port iz Unity "
        "izvornog projekta) sakriva sve mesh-eve izvan podstabla traženog "
        "dijela; <font face='%s'>fitOrthoToObject()</font> namješta "
        "ortografsku kameru na bbox vidljivih meshova. Susjedni dijelovi "
        "(BFS preko <font face='%s'>parts-neighbors.json</font>) iz drugih "
        "sustava dohvaćaju vlastiti GLB i kloniraju scene-graph radi "
        "izolacije." %
        (MONO, MONO, MONO, MONO, MONO, MONO, MONO)
    ))
    s.append(P(
        "<b>Tijek (b) — student prenosi vlastiti PDF.</b> "
        "<font face='%s'>UploadPdfButton</font> čita "
        "<font face='%s'>ArrayBuffer</font> datoteke; "
        "<font face='%s'>uploadIndexer.ts</font> (TypeScript port Python "
        "indeksera) ekstrahira tekst i bbox spans po stranici preko "
        "PDF.js-a. Rezultat (PdfDoc index, sirovi PDF blob, rendering meta) "
        "atomski se sprema u IndexedDB u 4 store-a "
        "(<font face='%s'>docs / pdfBlobs / pageSpans / pageImages</font>). "
        "Ako je korisnik prijavljen, <font face='%s'>cloudUploadDoc()</font> "
        "u pozadini pošalje PDF i spans u privatni Supabase bucket "
        "<font face='%s'>user-pdfs/&lt;user_id&gt;/</font>. Renderiranje "
        "stranica u WebP događa se on-demand pri prvom pregledu i kešira u "
        "IndexedDB." %
        (MONO, MONO, MONO, MONO, MONO, MONO)
    ))
    s.append(P(
        "<b>Tijek (c) — student postavlja pitanje AI tutoru.</b> "
        "Klijent slaže payload (system prompt, sažetak povijesti razgovora, "
        "do 6 zadnjih poruka, popis alata) i šalje POST na "
        "<font face='%s'>/api/agent/chat</font>. Vercel Funkcija samo "
        "prosljeđuje. Ako Sonnet vrati <font face='%s'>tool_use</font> blok, "
        "klijent izvršava alat lokalno (tool <font face='%s'>search_skripte</font> "
        "trči nad <font face='%s'>UnifiedIndex</font>-om koji uključuje i 5 "
        "zajedničkih skripti i sve korisnikove uploadane PDF-ove; "
        "<font face='%s'>prikaz_3d</font> vraća konfiguraciju 3D widgeta). "
        "Tool result se vraća u sljedeću iteraciju (do 5 koraka), a zadnji "
        "tekstualni odgovor se renderira react-markdownom. Reference "
        "(<font face='%s'>/docs?q=&hellip;&doc=&hellip;&page=42</font>) "
        "pretvaraju se u kliknute chip-ove koji deep-linkaju u skripte." %
        (MONO, MONO, MONO, MONO, MONO, MONO)
    ))

    # ---------- 4. STRUKTURA IZVORNOG KODA ----------
    s.append(section("4.", "Struktura izvornog koda"))
    s.append(P(
        "Repozitorij je jedan paket (<font face='%s'>web-prototype</font> "
        "u <font face='%s'>package.json</font>), bez monorepo alata. Top-level:" %
        (MONO, MONO)
    ))
    s.append(code_block(directory_tree()))
    folder_table = [
        ["Direktorij", "Sadržaj"],
        ["src/routes/",
         "Po jedna komponenta po ruti — Home, Docs, Agent, Viewer, Revise, "
         "ReviseTopic, ReviseToday, MyDecks, DeckStudy, DeckEditor, Quiz, "
         "QuizGame, QuizResults, Login, Profile."],
        ["src/components/",
         "Reusabilne UI cjeline grupirane po domeni: agent/, docs/, home/, "
         "quiz/, revise/, viewer/."],
        ["src/lib/",
         "Logika bez UI-a: agent.ts (LLM petlja), tools.ts (definicije + "
         "izvršavanje alata), data.ts (UnifiedIndex), srs.ts (Leitner SRS), "
         "auth.ts, supabase.ts, AuthContext.tsx, viewer/* (catalog, "
         "isolate, resolveParts), uploadIndexer.ts, localPdfRender.ts, "
         "cloudDocs.ts, xp.ts, quiz.ts, userDecks.ts."],
        ["api/",
         "Vercel Functions: agent/chat.ts (proxy), decks/generate.ts "
         "(generator kartica)."],
        ["public/data/",
         "Bundle JSON indeksi za 5 zajedničkih skripti + tematski Q&A "
         "(public/data/ponavljanje/)."],
        ["public/models/",
         "GLB modeli (8 sustava), parts-catalog.json, parts-neighbors.json, "
         "thumbs/ (sličice dijelova)."],
        ["tools/",
         "Pomoćne skripte: render_part_thumbnails.py (Blender), "
         "upload_to_supabase.ts (push PDF-ova/rendera), "
         "upload_thumbs_to_supabase.ts."],
    ]
    s.append(tech_table(folder_table, col_widths=[3.8 * cm, 13.3 * cm]))
    s.append(P(
        "<b>Konvencije.</b> Komponente i rute su PascalCase TSX, knjižnice "
        "camelCase TS. Stil ide kroz Tailwind utility klase + lokalne "
        "design-tokene (<font face='%s'>bg-surface</font>, "
        "<font face='%s'>text-text-muted</font>, "
        "<font face='%s'>border-border</font>). Alias "
        "<font face='%s'>@/</font> u tsconfigu pokazuje na "
        "<font face='%s'>src/</font>. Korijenski "
        "<font face='%s'>CLAUDE.md</font> drži arhitektonske bilješke i "
        "zamke." % (MONO, MONO, MONO, MONO, MONO, MONO)
    ))

    # ---------- 5. KLJUČNE ODLUKE ----------
    s.append(section("5.", "Ključne implementacijske odluke"))
    s.append(P(
        "Sljedeće odluke najviše utječu na izgled rješenja. Svaka je "
        "donesena svjesno; alternative i kompromisi navedeni su u 1–3 "
        "rečenice."
    ))

    decisions = [
        ("Web-first umjesto native mobilne aplikacije",
         "Studenti uče u različitim okruženjima (vlastito računalo, knjižnica, "
         "tuđi laptop). Web SPA daje nula-instalacijski pristup, a WebGL na "
         "modernom hardveru renderira sve sustave (~22&nbsp;MB GLB ukupno) "
         "bez problema. Kompromis: bez offline-first PWA prijavljen je u §9 "
         "kao sljedeći korak."),
        ("Anthropic Claude umjesto OpenAI ili Vercel AI Gatewaya",
         "Claude Sonnet 4.6 je u našim test-runovima dao najmanje srpsko-"
         "hrvatskih kontaminacija (\"talas\", \"vazduh\") i bolje slijedi "
         "kompleksne format-direktive (Reference sekciju, kompaktne bullete). "
         "Direktni SDK umjesto AI Gatewaya bira se da bismo imali potpunu "
         "kontrolu nad tool-use payloadom; planirano je razmotriti Gateway u "
         "produkciji za fallback i opservabilnost."),
        ("Hibridni Sonnet+Haiku model",
         "Glavni razgovor vodi Sonnet 4.6 (kvaliteta proze, dosljednost). "
         "Haiku 4.5 obavlja dva pomoćna posla: sažimanje rolling-window "
         "konteksta (background, ne blokira UI) i generiranje kartica decka "
         "(latencija je ovdje bitna). Ovo dijeli ~4× razlike u cijeni i "
         "brzini između modela."),
        ("Bez state-management knjižnice",
         "Aplikacija koristi React Context (AuthContext) za auth + krediti "
         "i lokalni state komponenti za sve ostalo. Trajni state ide u "
         "localStorage (XP, SRS, theme, agent history) ili IndexedDB "
         "(korisnički PDF-ovi i WebP rendere). Redux/Zustand bi bio "
         "preinženjering za prototip ovog opsega."),
        ("Klijentska indeksacija korisničkih PDF-ova",
         "Indeksiranje uploadanog PDF-a (PDF.js text + bbox spans) izvodi "
         "se u browseru, ne na serveru. Cijena: ~150–250 ms po stranici. "
         "Korist: nula transferiranog PDF teksta na naš server, lakša "
         "GDPR priča, i nema serverless cold-start kazne za skripte od 80 "
         "stranica."),
        ("8 GLB datoteka po anatomskom sustavu, ne jedan",
         "Jedan monolitni GLB (~120&nbsp;MB) bi blokirao prvi load. "
         "Razdvajanjem po sustavu studenti učitavaju samo skeleton.glb "
         "(4.5&nbsp;MB) za većinu interakcija; mišići (13&nbsp;MB) i ostalo "
         "učitavaju se on-demand kad korisnik traži dio iz tog sustava. "
         "<font face='%s'>useGLTF.preload</font> u home heroju brine za "
         "perceptivnu brzinu." % MONO),
        ("Leitner box SRS umjesto SM-2/Anki algoritma",
         "Pet kutija s fiksnim intervalima 1/3/7/14/30 dana je dovoljno "
         "za hackathon scope, jednostavno za tumačenje korisniku, i bez "
         "rubnih slučajeva (ease-factor truleži kakve imaju SM-2 portovi)."),
        ("Hackathon-grade auth shim",
         "Plain SHA-256(salt+lozinka) u Postgres tablici, RLS "
         "<font face='%s'>using&nbsp;(true)</font> za demo. Dosljedno "
         "označeno kao privremeno — §7 detaljnije, §9 navodi prijelaz na "
         "Supabase Auth kao must-do prije produkcije." % MONO),
    ]
    for title, body in decisions:
        s.append(Paragraph(f"<b>{title}.</b> {body}", S_BODY))

    # ---------- 6. AI komponenta ----------
    s.append(section("6.", "AI komponenta — kako radi"))
    s.append(subsection("6.1.", "Indeksiranje literature"))
    s.append(P(
        "Aplikacija indeksira tekst iz dva izvora: (1) <b>5 zajedničkih "
        "skripti</b> off-line (Python skripta "
        "<font face='%s'>tools/build_pdf_index.py</font> u Unity repozitoriju "
        "proizvodi JSON-ove u <font face='%s'>public/data/</font>) i "
        "(2) <b>korisničkih PDF-ova</b> u browseru pomoću "
        "<font face='%s'>uploadIndexer.ts</font>. Format je u oba slučaja "
        "isti <font face='%s'>PdfDoc</font>: po terminu se drži lista "
        "<font face='%s'>Hit</font>-ova s pre/match/post kontekstom i "
        "stranicom. Funkcija <font face='%s'>loadUnifiedIndex()</font> "
        "u <font face='%s'>data.ts</font> spaja oba u jednu strukturu, koju "
        "alat <font face='%s'>search_skripte</font> pretražuje fuzzy "
        "match-om." % (MONO, MONO, MONO, MONO, MONO, MONO, MONO, MONO)
    ))
    s.append(P(
        "<b>Bez vektorskih embeddings/RAG</b>. Korpus je dovoljno malen "
        "(~1300 stranica) da fuzzy-match nad pre-extractiranim terminima daje "
        "kvalitetne pogotke uz konstantnu memoriju i 0&nbsp;€ inference troška. "
        "Embedding-based RAG je naveden u §9 kao mogući upgrade."
    ))

    s.append(subsection("6.2.", "Agentska petlja i alati"))
    s.append(P(
        "Petlja u <font face='%s'>src/lib/agent.ts</font>:" % MONO))
    s.append(code_block(agent_loop_pseudocode()))
    s.append(P(
        "Definirana su <b>dva alata</b> u "
        "<font face='%s'>src/lib/tools.ts</font>:" % MONO))
    s.append(bullet(
        "<b>search_skripte(query)</b> — vraća do 3 najbolje pogođena termina, "
        "po 5 izvadaka, svaki s deep-link URL-om "
        "<font face='%s'>/docs?q=&hellip;&doc=&hellip;&page=N</font>." % MONO))
    s.append(bullet(
        "<b>prikaz_3d(title, focus, extras[])</b> — vraća konfiguraciju za "
        "inline 3D widget unutar chata. <font face='%s'>focus</font> "
        "(npr. \"Femur\") i do 5 dodatnih dijelova. "
        "<font face='%s'>InlineAnatomy3D.tsx</font> prima konfiguraciju i "
        "renderira mini-viewer s kamerom fitanom na sve dijelove zajedno." %
        (MONO, MONO)))
    s.append(P(
        "Skraćeni primjer Anthropic tool deklaracije:"
    ))
    s.append(code_block(tool_def_snippet()))

    s.append(subsection("6.3.", "Citiranje izvora"))
    s.append(P(
        "Sustavni prompt obvezuje model da, kad alat vrati pogotke, na kraju "
        "odgovora doda sekciju <b>Reference</b> s do 4 chip-linka — i da "
        "URL prepiše doslovno iz tool resulta. <font face='%s'>ChatLog.tsx</font> "
        "ima custom anchor renderer koji <font face='%s'>/docs?</font> "
        "linkove pretvara u tipke s ikonom knjige + kratkim labelom. Ako "
        "alat ne nađe ništa, prompt zabranjuje pisati \"skripte ne pokrivaju\" — "
        "model jednostavno odgovori iz svog znanja bez Reference sekcije." %
        (MONO, MONO)
    ))

    s.append(subsection("6.4.", "Brojač kredita"))
    s.append(P(
        "Trenutno: AI je besplatan, krediti su kozmetika i raste/pada se "
        "ručno preko <font face='%s'>addCredits()</font>. Modelirani su tako "
        "da svaka chat-tura košta 1 kredit, generiranje decka 5 kredita "
        "(planirano). Realna integracija sa Stripe-om i tokensko-bazirano "
        "skidanje kredita po <font face='%s'>usage</font> polju Anthropic "
        "odgovora <b>(planirano)</b>." % (MONO, MONO)
    ))

    # ---------- 7. SIGURNOST ----------
    s.append(section("7.", "Sigurnost i privatnost"))
    sec_table = [
        ["Aspekt", "Stanje"],
        ["Autentikacija",
         "Hackathon-shim: SHA-256(salt+lozinka) → Postgres tablica "
         "users. Bez Supabase Auth, JWT-a, OAuth-a ni email verifikacije. "
         "Salt je fiksni string, dovoljan da spriječi otvoreni transfer "
         "lozinki. <b>Plan za produkciju</b>: prelazak na Supabase Auth "
         "(magic link / password) i <font face='%s'>auth.uid()</font>-bazirane "
         "RLS politike." % MONO],
        ["Transport",
         "Sav promet preko HTTPS-a (Vercel + Supabase oba forsiraju TLS). "
         "API ključ za Anthropic nikad ne ulazi u klijentski bundle u "
         "produkciji — postavlja se kao <font face='%s'>ANTHROPIC_API_KEY</font> "
         "Vercel env var i čita ga samo Vercel Funkcija." % MONO],
        ["Pohrana",
         "Postgres podaci enkriptirani at-rest na Supabase strani "
         "(AES-256). Korisnički PDF-ovi u privatnom bucketu nisu indeksirani "
         "javno, ali RLS je trenutno permisivan (<font face='%s'>using "
         "(true)</font>) — tek pristup s anon ključem ograničava klijent "
         "filtrom <font face='%s'>user_id</font>. Tighten je naveden u §9."
         % (MONO, MONO)],
        ["GDPR",
         "Minimum: bilježimo samo username + lozinka hash + brojač kredita; "
         "nema email-a, IP-a, telemetrije. Brisanje računa <b>(planirano)</b> "
         "kao endpoint koji DELETE-a redak iz users + sve "
         "<font face='%s'>user-pdfs/&lt;user_id&gt;/*</font> objekte. Pravo "
         "na ispis: izvoz JSON dampa korisničkih dec-kova i SRS stanja "
         "<b>(planirano)</b>." % MONO],
        ["LLM podaci",
         "Anthropic Commercial Terms: API podaci se ne koriste za treniranje "
         "modela (default). Promptovi sadrže korisnikova pitanja i izvatke "
         "iz njegove literature; preporuka u §9 je dodati eksplicitni "
         "consent dijalog prije prvog AI poziva."],
    ]
    s.append(tech_table(sec_table, col_widths=[3.6 * cm, 13.5 * cm]))

    # ---------- 8. DEPLOYMENT ----------
    s.append(section("8.", "Deployment"))
    s.append(P(
        "Cjelokupna aplikacija deploya se kao jedan Vercel projekt iz "
        "<font face='%s'>main</font> brancha." % MONO
    ))
    deploy_table = [
        ["Komponenta", "Hosting"],
        ["Statički build (HTML, JS, CSS, GLB, sličice)",
         "Vercel CDN. Build komanda <font face='%s'>npm&nbsp;run&nbsp;build</font> "
         "(<font face='%s'>tsc&nbsp;-b&nbsp;&amp;&amp;&nbsp;vite&nbsp;build</font>), "
         "output direktorij <font face='%s'>dist/</font>. SPA fallback "
         "preko <font face='%s'>vercel.ts</font> rewrite-a (<font face='%s'>"
         "/(.*) → /index.html</font>)." %
         (MONO, MONO, MONO, MONO, MONO)],
        ["Serverless funkcije",
         "Vercel Functions, Node.js runtime (default 24 LTS), Fluid "
         "Compute. Direktorij <font face='%s'>api/</font>." % MONO],
        ["Baza i Storage",
         "Supabase (managed, EU-West-1)."],
        ["LLM",
         "Anthropic API (us-east-1 endpoint)."],
        ["CI/CD",
         "Native Vercel Git integration: push → preview deploy. Promote "
         "preview-a u produkciju ide manualno preko Vercel UI-ja. Bez "
         "GitHub Actions u ovom trenutku."],
    ]
    s.append(tech_table(deploy_table, col_widths=[4.0 * cm, 13.1 * cm]))
    s.append(P(
        "<b>Konfiguracija (vercel.ts).</b> Projekt koristi novi "
        "<font face='%s'>vercel.ts</font> format umjesto "
        "<font face='%s'>vercel.json</font>:" % (MONO, MONO)
    ))
    s.append(code_block(vercel_ts_snippet()))
    s.append(P(
        "<b>Pristup za žiri.</b> Aplikacija je dostupna na javnoj Vercel "
        "produkcijskoj poveznici (priložena u Lumen submission formi); "
        "registracija unutar aplikacije je jedan ekran, nije potreban email. "
        "Demo račun s napunjenim kreditima može se osigurati na zahtjev — "
        "vidi popratni <font face='%s'>README.md</font>." % MONO
    ))

    # ---------- 9. OGRANIČENJA ----------
    s.append(section("9.", "Poznata ograničenja i sljedeći koraci"))
    s.append(P("Stanje na predaju, organizirano po prioritetu."))

    s.append(subsection("9.1.", "Sigurnost — must-do prije produkcije"))
    s.append(bullet(
        "<b>Zamjena auth shim-a Supabase Auth-om.</b> Trenutni "
        "SHA-256-with-static-salt model nije pogodan za stvarne korisnike. "
        "Migracija: omogućiti email/password (ili magic link) preko "
        "<font face='%s'>supabase.auth</font>, prebaciti RLS na "
        "<font face='%s'>auth.uid() = user_id</font>." % (MONO, MONO)))
    s.append(bullet(
        "<b>Tightening RLS.</b> Sve tri tablice (<font face='%s'>users</font>, "
        "<font face='%s'>user_pdfs</font>, Storage objekti) trenutno "
        "imaju <font face='%s'>using (true)</font>. To zadovoljava demo, "
        "ali bilo tko s anon ključem može čitati cijeli <font face='%s'>"
        "user_pdfs</font> namespace." %
        (MONO, MONO, MONO, MONO)))
    s.append(bullet(
        "<b>Rate-limit na /api/agent/chat.</b> Trenutno bez "
        "ograničenja — jedan zlonamjerni klijent može potrošiti naš "
        "Anthropic budget. Plan: Vercel Edge rate-limit + per-user "
        "credit-check prije proxy-anja."))

    s.append(subsection("9.2.", "Monetizacija — stub"))
    s.append(bullet(
        "<b>Stripe integracija.</b> Tri paketa kredita su trenutno samo "
        "fake-purchase tipke (<font face='%s'>Profile.tsx</font>) koje "
        "lokalno povećaju brojač. Plan: Stripe Checkout + webhook na novu "
        "Vercel funkciju koja inkrementira <font face='%s'>credits</font>." %
        (MONO, MONO)))
    s.append(bullet(
        "<b>Stvarno trošenje kredita.</b> Anthropic <font face='%s'>usage</font> "
        "polje (input/output tokens) treba pretvoriti u kredite po "
        "transparentnoj formuli i odbiti od balansa atomarno na strani "
        "Vercel funkcije." % MONO))

    s.append(subsection("9.3.", "Funkcionalna proširenja"))
    s.append(bullet(
        "<b>Šira pokrivenost kataloga 3D dijelova.</b> "
        "<font face='%s'>parts-catalog.json</font> trenutno modelira cijele "
        "kosti i veće mišiće. Sub-strukture (npr. acetabulum, crista iliaca) "
        "nemaju zasebne ID-eve, pa AI tutor ne može pozvati "
        "<font face='%s'>prikaz_3d(\"acetabulum\")</font>. Treba dodati "
        "anchor-pointove u Blender export skripti." % (MONO, MONO)))
    s.append(bullet(
        "<b>Embedding-based semantička pretraga.</b> Trenutni fuzzy-match "
        "ne hvata sinonime (\"sciatic nerve\" vs \"n. ischiadicus\"). Plan: "
        "embeddings (npr. Voyage AI) na razini paragrafa, hibridna pretraga."))
    s.append(bullet(
        "<b>PWA + offline.</b> Service Worker za pre-cache GLB modela i "
        "skripti, IndexedDB za sve user state, fallback poruka kad nema "
        "konekcije za AI."))
    s.append(bullet(
        "<b>Više-jezična podrška.</b> UI je trenutno isključivo na "
        "hrvatskom, AI prompt također. Engleski mod planiran kao toggle u "
        "profilu."))
    s.append(bullet(
        "<b>Kolaborativni decki.</b> Dijeljenje korisničkih dec-kova preko "
        "Supabase Realtime kanala je u idejnoj fazi."))

    s.append(subsection("9.4.", "Znana neslaganja s idejnim dokumentom"))
    s.append(bullet(
        "Idejni dokument spomenuo je <i>native mobilnu</i> aplikaciju "
        "(TestFlight / Google Play) s on-device 3D renderiranjem. Hackathon "
        "implementacija je <b>web-first</b>; native paketiranje (npr. "
        "Capacitor wrapper) je u backlogu, ali nije isporučeno."))
    s.append(bullet(
        "Idejni dokument spominje plaćanja preko Apple/Google IAP. Web "
        "verzija će umjesto toga koristiti Stripe (vidi §9.2)."))

    return s


# ---------------------------------------------------------------------------
# Helpers — content
# ---------------------------------------------------------------------------

def tech_table(rows, col_widths=None):
    if col_widths is None:
        col_widths = [4.0 * cm, 5.6 * cm, 7.5 * cm][: len(rows[0])]
        if len(rows[0]) == 2:
            col_widths = [5.0 * cm, 12.1 * cm]
    bold = SANS + "-Bold" if SANS != "Helvetica" else "Helvetica-Bold"
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), bold),
                ("FONTNAME", (0, 1), (-1, -1), SANS),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1),
                 [colors.white, colors.HexColor("#F8FAFC")]),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, ACCENT),
                ("BOX", (0, 0), (-1, -1), 0.3, SOFT_GREY),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


def diagram_text() -> str:
    return r"""
   ┌──────────────────────────────────────────────────────────┐
   │                       PREGLEDNIK (SPA)                   │
   │  React 19 + Vite + Tailwind 4                            │
   │  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌─────────┐  │
   │  │  /viewer   │ │  /docs     │ │  /agent  │ │  /quiz  │  │
   │  │ three.js   │ │ pdfjs-dist │ │  chat UI │ │  3D Q&A │  │
   │  └────────────┘ └────────────┘ └──────────┘ └─────────┘  │
   │  localStorage  │  IndexedDB (user PDFs, WebP cache)      │
   └─────┬───────────────┬─────────────────┬───────────┬──────┘
         │ statički      │ POST /api       │ HTTPS     │ HTTPS
         │ assets        │   /agent/chat   │ REST + SB │ REST
         │               │   /decks/gen    │ Auth      │ Storage
         ▼               ▼                 ▼           ▼
   ┌────────────┐ ┌────────────────┐ ┌──────────────────────┐
   │ Vercel CDN │ │ Vercel Function│ │      Supabase        │
   │ dist/      │ │ Node.js 24 LTS │ │  Postgres + Storage  │
   │ GLB modeli │ │ ANTHROPIC_KEY  │ │  ──────────────────  │
   │ JSON index │ │ proxy → AI     │ │  users, user_pdfs    │
   └────────────┘ └────────┬───────┘ │  pdfs, pdfs-rendered │
                           │         │  user-pdfs, thumbs   │
                           ▼         └──────────────────────┘
                    ┌──────────────┐
                    │ Anthropic    │
                    │ Claude API   │
                    │ Sonnet 4.6   │
                    │ Haiku  4.5   │
                    └──────────────┘
"""


def directory_tree() -> str:
    return r"""anatomed-web/
├── api/                       # Vercel Functions (Node.js)
│   ├── agent/chat.ts          #   AI proxy
│   └── decks/generate.ts      #   deck-card generator
├── public/
│   ├── data/                  # bundled PDF JSON indeksi
│   │   └── ponavljanje/       # Q&A teme za /revise
│   └── models/                # 3D atlas
│       ├── glb/               # 8 GLB datoteka (skeleton, muscles, ...)
│       ├── thumbs/            # part thumbnails
│       ├── parts-catalog.json
│       └── parts-neighbors.json
├── src/
│   ├── App.tsx + main.tsx     # SPA root + router
│   ├── routes/                # 1 fajl po ruti (/docs, /agent, /viewer, ...)
│   ├── components/            # agent/, docs/, home/, quiz/, revise/, viewer/
│   ├── lib/                   # logika bez UI-ja
│   │   ├── agent.ts           #   LLM petlja
│   │   ├── tools.ts           #   search_skripte, prikaz_3d
│   │   ├── data.ts            #   UnifiedIndex
│   │   ├── srs.ts             #   Leitner box
│   │   ├── auth.ts + AuthContext.tsx + supabase.ts
│   │   ├── viewer/            #   catalog, isolate, resolveParts
│   │   ├── uploadIndexer.ts   #   PDF → index u browseru
│   │   └── cloudDocs.ts       #   sync user-pdfs ↔ Supabase
│   └── index.css
├── tools/                     # Python + TS pomoćne skripte
├── vercel.ts                  # konfiguracija (umjesto vercel.json)
├── vite.config.ts
├── tsconfig.*.json
└── package.json
"""


def agent_loop_pseudocode() -> str:
    return r"""// Pseudokod, src/lib/agent.ts (Sonnet vodi cijelu turu).
async function chat(history, userInput, onStatus) {
  const messages = [...rollingWindow(history), { role: 'user', text: userInput };

  for (let step = 0; step < MAX_TOOL_ITERATIONS /* = 5 */; step++) {
    onStatus({ phase: 'thinking' });
    const r = await callAnthropic({
      model: 'claude-sonnet-4-6',
      system: SYSTEM_PROMPT + summary,
      messages,
      tools: TOOL_DEFINITIONS,        // [search_skripte, prikaz_3d]
      max_tokens: 1024,
    });

    if (r.stop_reason === 'tool_use') {
      const block = r.content.find(b => b.type === 'tool_use');
      onStatus({ phase: 'tool', name: block.name, input: block.input });
      const result = await runTool(block.name, block.input);   // lokalno!
      messages.push({ role: 'assistant', content: r.content });
      messages.push({ role: 'user', content:
        [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }]
      });
      continue;                       // iteriraj
    }

    return r.content.find(b => b.type === 'text').text;   // odgovor korisniku
  }
}
"""


def tool_def_snippet() -> str:
    return r"""// src/lib/tools.ts — definicija (skraćeno)
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_skripte',
    description: 'Pretražuje sve indeksirane skripte … vraća do 3 termina × 5 hits.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Anatomski pojam …' } },
      required: ['query'],
    },
  },
  {
    name: 'prikaz_3d',
    description: 'Renderira interaktivni 3D model unutar chata.',
    input_schema: {
      type: 'object',
      properties: {
        title:  { type: 'string' },
        focus:  { type: 'string' },                       // npr. "Femur"
        extras: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'focus'],
    },
  },
];
"""


def vercel_ts_snippet() -> str:
    return r"""// vercel.ts
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  // SPA fallback: deep-linkovi /docs, /viewer, /agent serviraju index.html.
  // Filesystem i Function matchevi imaju prioritet, pa /api/* radi normalno.
  rewrites: [routes.rewrite('/(.*)', '/index.html')],
};
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    out = "/Users/pitfa19/Documents/anatomed-web/tehnicka_dokumentacija.pdf"
    doc = make_doc(out)
    story = build_story()
    doc.build(story)
    size = os.path.getsize(out)
    print(f"Wrote {out} ({size/1024:.1f} KB)")


if __name__ == "__main__":
    main()
