# ECI Form 20 ingestion pipeline

Booth-level results in India are published as PDFs (Form 20 / part-wise
result sheets) by the ECI and state CEOs — not as clean CSVs. This is the
pipeline that turns those into rows in `results` at BOOTH level.

## Pipeline

```
download_form20(url)  ->  parse_form20_pdf(path)  ->  load_booths.js
   (parse_form20.py)         (parse_form20.py)          (Node)
```

1. **`download_form20()`** in `parse_form20.py` — fetches a Form 20 PDF from
   an ECI/CEO URL.
2. **`parse_form20_pdf()`** — uses `pdfplumber` to extract the booth-wise
   table: Sl.No, Part No, Polling Station name, one column per candidate,
   Total. Guesses each candidate's party from the column header and each
   booth's mandal from its name.
3. **`load_booths.js`** — takes the parser's JSON output, creates a BOOTH-
   level `admin_units` row per booth (under the matching mandal), and
   inserts `results` + `turnout` rows for the given AC/election. Links
   booth-level candidates back to the same `candidates` row used at
   AC level where the party matches, so a "swing booth" query can join
   cleanly across levels.

## Run it

```
pip install pdfplumber reportlab --break-system-packages
python3 ingestion/generate_sample_form20.py                 # builds a test fixture PDF
python3 ingestion/parse_form20.py ingestion/sample_form20_badvel_2024.pdf ingestion/parsed_badvel_2024.json
node ingestion/load_booths.js ingestion/parsed_badvel_2024.json Badvel 2024
```

Verified end to end: booth-summed vote totals reconcile against the
existing AC-level row within rounding noise (the fixture's synthetic
split, not real ECI data — see below).

## Important constraint: this sandbox can't reach eci.gov.in

`download_form20()` is real, working code — but this development sandbox's
network egress allowlist doesn't include `eci.gov.in` or state CEO domains,
so it can't be exercised here. **`generate_sample_form20.py` exists solely
to work around that**: it produces a PDF laid out like a real Form 20, with
the same column structure, but the booth-by-booth vote *splits* inside it
are fabricated (randomly distributed, only the AC-level column totals are
anchored to Badvel's real 2024 numbers). Don't mistake the fixture's booth
numbers for real data — they're a parser test, not a data source.

To ingest real booth-level data:
1. Run this pipeline from an environment with access to `old.eci.gov.in` /
   the relevant state CEO site, or download the PDFs manually and point
   `parse_form20_pdf()` at the local file — that part works today regardless
   of network access.
2. Form 20 layouts vary somewhat by state and year (column order, whether
   NOTA is a separate column, multi-page continuation headers). Treat the
   header-column extraction and `guess_mandal()` regex as a starting point
   to adjust per state, not a universal parser — validate reconstructed
   totals against the known AC-level result before trusting a new format.
