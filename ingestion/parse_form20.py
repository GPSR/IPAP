"""
Parses ECI Form 20-style PDFs (booth/part-wise vote count sheets) into
structured records ready to load into the `results` table at BOOTH level.

Real-world usage: point download_form20(url, out_path) at an actual ECI
constituency-wise Form 20 PDF (from old.eci.gov.in/statistical-report or
a state CEO's site) and it downloads + parses it. This sandbox's network
egress allowlist doesn't include eci.gov.in, so that download step can't
be exercised here — see ingestion/README.md. parse_form20_pdf() itself is
fully tested against generate_sample_form20.py's fixture.

Output shape (one dict per booth):
{
  "part_no": "003",
  "booth_name": "Kalasapadu GPS Booth 1",
  "mandal_hint": "Kalasapadu",       # parsed from booth_name where possible
  "candidates": [
    {"name": "Dasari Sudha (YSRCP)", "party_guess": "YSRCP", "votes": 3121},
    ...
  ],
  "total_votes": 6789
}
"""

import re
import sys
import json
import urllib.request
import pdfplumber

PARTY_ABBRS = ["YSRCP", "TDP", "BJP", "INC", "JSP", "CPI", "CPM", "IND", "NOTA"]


def download_form20(url, out_path):
    """Download a Form 20 PDF from an ECI URL. Requires network access to
    eci.gov.in or the relevant state CEO domain, which this sandbox does
    not have — included for completeness / use in an unrestricted env."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp, open(out_path, "wb") as f:
        f.write(resp.read())
    return out_path


def guess_party(candidate_label):
    """Form 20 headers are usually 'Candidate Name (PARTY)' or just party
    abbreviations for well-known parties; NOTA is its own column."""
    m = re.search(r"\(([A-Z]+)\)\s*$", candidate_label)
    if m and m.group(1) in PARTY_ABBRS:
        return m.group(1)
    upper = candidate_label.upper()
    if "NOTA" in upper:
        return "NOTA"
    for abbr in PARTY_ABBRS:
        if abbr in upper:
            return abbr
    return None


def guess_mandal(booth_name):
    """Booth names in this fixture are 'Mandal GPS Booth N' — real ECI
    sheets vary by state, so this is a best-effort heuristic, not a
    guaranteed match; verify against the mandal list before loading."""
    m = re.match(r"^([A-Za-z.\s]+?)\s+(GPS|Booth|Polling)", booth_name)
    return m.group(1).strip() if m else None


def parse_form20_pdf(pdf_path):
    booths = []
    with pdfplumber.open(pdf_path) as pdf:
        header = None
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                if header is None:
                    header = table[0]
                rows = table[1:] if table[0] == header else table

                # Candidate columns sit between the fixed leading columns
                # (Sl.No, Part No, Polling Station) and the trailing Total.
                candidate_cols = header[3:-1]

                for row in rows:
                    if not row or len(row) < 4:
                        continue
                    sl_no, part_no, booth_name = row[0], row[1], row[2]
                    if not sl_no or not sl_no.strip().isdigit():
                        continue  # skip the TOTAL row / blank rows
                    if sl_no.strip().upper() == "TOTAL":
                        continue

                    vote_cells = row[3:-1]
                    try:
                        votes = [int(v.replace(",", "")) for v in vote_cells]
                    except (ValueError, AttributeError):
                        continue

                    candidates = []
                    for label, v in zip(candidate_cols, votes):
                        candidates.append({
                            "name": label,
                            "party_guess": guess_party(label),
                            "votes": v
                        })

                    booths.append({
                        "part_no": part_no.strip() if part_no else None,
                        "booth_name": booth_name.strip() if booth_name else None,
                        "mandal_hint": guess_mandal(booth_name or ""),
                        "candidates": candidates,
                        "total_votes": sum(votes)
                    })
    return booths


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "ingestion/sample_form20_badvel_2024.pdf"
    json_out = sys.argv[2] if len(sys.argv) > 2 else None

    booths = parse_form20_pdf(path)

    if json_out:
        with open(json_out, "w") as f:
            json.dump(booths, f, indent=2)
        print(f"Parsed {len(booths)} booths from {path} -> wrote {json_out}")
    else:
        print(f"Parsed {len(booths)} booths from {path}\n")
        print(json.dumps(booths[:3], indent=2))
        print("...")

    total_by_candidate = {}
    for b in booths:
        for c in b["candidates"]:
            total_by_candidate[c["name"]] = total_by_candidate.get(c["name"], 0) + c["votes"]
    print("\nReconstructed AC totals from booth rows:")
    for name, v in total_by_candidate.items():
        print(f"  {name}: {v}")
