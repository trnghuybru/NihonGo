# Thesis page limits

The user's page allocation below is mandatory and supersedes older template comments or README guidance where they differ.

| Part | Required pages |
| --- | --- |
| Title page | Exactly 1 |
| Content page / Table of Contents | At most 5 |
| Executive Summary | Exactly 1 |
| Chapter 1: Introduction | 5–7 |
| Chapter 2: Literature Review & Background | At most 25 |
| Chapter 3: Product Design and Development | At most 25 |
| Chapter 4: Deployment and Business Models | At most 5 |
| Chapter 5: Conclusion & Product Roadmap | At most 5 |
| Reference list | At most 3 |
| Appendices, combined | At most 10 |
| Entire PDF, including front matter and appendices | At most 100 |

## Editing and verification

- Write report prose from the student team's perspective (e.g. "nhóm lựa chọn", "hệ thống sử dụng"). Describe the work and design choices directly, rather than narrating the assistant's inspection of source code or project configuration. Source verification belongs in comments or supporting evidence, except where evidence provenance is itself relevant to an evaluation.
- Check actual page boundaries after compiling twice. Do not infer compliance from the total PDF length alone; individual chapter limits also apply.
- Account for unfinished sections when allocating space, including the Chapter 3 summary; do not consume the entire chapter allowance with diagrams and specifications.
- Preserve the established text size, margins and spacing. Do not make diagrams or tables illegible to meet a page limit.
- The user explicitly requires section 3.7 (Chapter Summary) to summarize the chapter in approximately half a page; retain that depth when making later pagination cuts.
- The user subsequently requested brief explanatory paragraphs beneath diagrams, including architecture and business flows, using existing page whitespace. Retain these descriptions; this supersedes the earlier request to keep Overall Architecture image-only.
- Prefer removing wasted space, concise wording, and grouping related figures. Any relocation to appendices must preserve cross-references and keep all appendices within their combined 10-page limit. Do not silently discard previously requested detailed specifications or diagrams.
- Base report claims on actual implementation and supplied evidence. Do not invent content to fill a page target.
- Report any exceeded limit or missing required part explicitly. Do not describe the report as compliant until both chapter and total limits have been checked.

## Baseline audit before pagination revision (25 November 2026)

The current compiled report has 70 physical PDF pages. Chapter boundaries from `main.toc` are: Chapter 1 pp. 1–7 (7 pages); Chapter 2 pp. 8–18 (11); Chapter 3 pp. 19–56 (38); Chapter 4 p. 57 (1); Chapter 5 p. 58 (1). The Table of Contents occupies 3 pages, references 1 page, and appendices 2 pages.

Outstanding issues: Chapter 3 exceeds its limit by 13 pages and still has unfinished sections; the cover source generates two cover pages; Executive Summary is absent. This baseline is not a compliance claim and must be recalculated after layout or content changes.

Latest pagination audit after the approved cuts, half-page chapter summary and four-cell SWOT matrix: Chapter 2 occupies pp. 8–17 (10 pages); Chapter 3 pp. 18–45 (28 pages); Chapter 4 pp. 46–48 (3 pages); the PDF totals 64 pages. The four full-screen captures now belong to 4.1.1; component crops remain in 3.4. The Account Registration and Learning Setup business process and the Beta Quotas and AI Usage ERD subsection have been removed; the other seven process diagrams remain. Chapter 3 still exceeds its limit by 3 pages; further cuts require an applicable user request.
