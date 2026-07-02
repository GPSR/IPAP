"""
Generates a TEST FIXTURE PDF that mimics the layout of ECI's Form 20
(booth-wise / part-wise result sheet), for the sole purpose of testing
parse_form20.py end to end.

IMPORTANT: the booth-level numbers in this PDF are FABRICATED. They are
NOT real ECI data — they exist only to prove the parsing pipeline works.
The AC-level totals are loosely anchored to Badvel 2024's real numbers
(90410 / 71843 / 7366 / 3076) but split across invented booths using a
randomized distribution, so do not use this file as a data source.

Why this exists at all: this sandbox's network egress allowlist doesn't
include eci.gov.in, so real ECI PDFs can't be downloaded and parsed here.
This fixture lets the parser be built and verified regardless; pointing
downloader.py at a real ECI URL from an environment with that access is
a one-line config change (see ingestion/README.md).
"""

import random
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

random.seed(42)

CANDIDATES = ["Dasari Sudha (YSRCP)", "Bojja Roshanna (BJP)", "Neerugattu Dora Vijaya Jyothi (INC)", "NOTA"]
AC_TOTALS = [90410, 71843, 7366, 3076]  # real 2024 AC-level totals, for anchoring only
MANDALS = ["Kalasapadu", "B.Kodur", "Sri Avadhutha Kasinaya", "Porumamilla", "Badvel", "Gopavaram", "Atlur"]
BOOTHS_PER_MANDAL = 4

def synthesize_booth_rows():
    rows = []
    booth_no = 1
    # Split each candidate's AC total across booths using Dirichlet-like
    # random weights so booth numbers sum exactly to the real AC total.
    n_booths = len(MANDALS) * BOOTHS_PER_MANDAL
    weight_sets = [[random.random() for _ in range(n_booths)] for _ in CANDIDATES]
    weight_sets = [[w / sum(ws) for w in ws] for ws in weight_sets]

    idx = 0
    for mandal in MANDALS:
        for b in range(1, BOOTHS_PER_MANDAL + 1):
            votes = []
            for c_idx, total in enumerate(AC_TOTALS):
                v = round(total * weight_sets[c_idx][idx])
                votes.append(v)
            idx += 1
            rows.append({
                "sl_no": booth_no,
                "part_no": f"{booth_no:03d}",
                "mandal": mandal,
                "booth_name": f"{mandal} GPS Booth {b}",
                "votes": votes
            })
            booth_no += 1
    return rows

def build_pdf(path):
    rows = synthesize_booth_rows()
    doc = SimpleDocTemplate(path, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("FORM 20 (TEST FIXTURE — FABRICATED DATA, NOT AN ECI DOCUMENT)", styles["Heading2"]))
    elements.append(Paragraph("Constituency: 124 - Badvel (SC), YSR Kadapa District, Andhra Pradesh", styles["Normal"]))
    elements.append(Paragraph("General Election to the Legislative Assembly, 2024 (synthetic booth split for pipeline testing only)", styles["Normal"]))
    elements.append(Spacer(1, 8))

    header = ["Sl.No.", "Part No.", "Polling Station"] + CANDIDATES + ["Total"]
    table_data = [header]
    col_totals = [0] * len(CANDIDATES)
    for r in rows:
        total = sum(r["votes"])
        for i, v in enumerate(r["votes"]):
            col_totals[i] += v
        table_data.append([str(r["sl_no"]), r["part_no"], r["booth_name"]] + [str(v) for v in r["votes"]] + [str(total)])

    table_data.append(["", "", "TOTAL"] + [str(t) for t in col_totals] + [str(sum(col_totals))])

    t = Table(table_data, repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("BACKGROUND", (0, -1), (-1, -1), colors.whitesmoke),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
    ]))
    elements.append(t)
    doc.build(elements)
    print(f"Wrote {path} with {len(rows)} booth rows across {len(MANDALS)} mandals.")
    print(f"Column totals (should roughly match AC 2024 totals {AC_TOTALS}): {col_totals}")

if __name__ == "__main__":
    build_pdf("/home/claude/badvel-analytics/ingestion/sample_form20_badvel_2024.pdf")
