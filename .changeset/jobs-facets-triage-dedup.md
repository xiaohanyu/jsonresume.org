---
'@jsonresume/jobs': minor
---

Triage mode and honest facets. Press `t` to y/n-triage new jobs card by card (marks feed the ranking's relevance feedback); job rows and detail panes now show facet chips — remote scope (global vs geo-fenced with regions), seniority, salary with `(stated)`/`(est.)` provenance — and a "still hiring · Nth month" badge on monthly reposts. Server-side: ingest-time structured facet extraction with strict provenance over the whole corpus, semantic repost dedup (families collapse to their newest post), and facet-aware remote filtering.
