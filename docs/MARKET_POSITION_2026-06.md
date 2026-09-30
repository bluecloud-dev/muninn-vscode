# Muninn — Market Position Review (June 9, 2026)

> Historical June 2026 planning snapshot. The AGPL decision remains recorded in [D-006](decisions/D-006-agpl-relicense.md); the release targets and issue instructions below are not current. See [ROADMAP.md](ROADMAP.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for current direction and implementation.


> Refreshes `docs/COMPETITIVE_BRIEF.md` (May 2026) with live marketplace data, records the AGPL-3.0 license decision as final, and folds in the accessibility audit (`docs/design/ACCESSIBILITY_AUDIT_2026-06.md`) and design critique (`docs/design/DESIGN_CRITIQUE_2026-06.md`) executed today. Where this document and the May brief disagree, this document wins.

---

## 1. The one-paragraph verdict

Muninn's product thesis is still correct and still undefended — no incumbent owns single-pane WYSIWYG markdown inside VS Code, and the June 2026 "best markdown extension" listicles still recommend zero WYSIWYG editors. But the competitive window is now visibly closing from two directions: Microsoft has a concrete, spec-shaped feature request for a **built-in** markdown WYSIWYG editor on file (microsoft/vscode #296639, Feb 2026), and new entrants shipped updates in Feb–Mar 2026 while Muninn remains **unpublished, with zero marketplace presence and zero GitHub stars**. The binding constraint on "top-tier" is no longer feature depth or architecture — both are ahead of the direct competition — it is distribution. Every week of polish-before-publish is a week the category stays winnable by someone else.

## 2. What changed since the May brief

| #   | May 2026 claim                               | June 9, 2026 reality                                                                                                                                                                                                                                                                                                                                        | Consequence                                                                                                                                                         |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MAIO ~12.5M installs                         | **12,967,389**                                                                                                                                                                                                                                                                                                                                              | Incumbents still growing ~1%/mo; adjacent, not direct                                                                                                               |
| 2   | MPE ~8.5M installs                           | **9,376,486** — grew through the CVE                                                                                                                                                                                                                                                                                                                        | A CVE alone does not move users; the security wedge needs _active_ marketing, not schadenfreude                                                                     |
| 3   | zaaack.markdown-editor installs unknown      | **205,137**, 34 ratings (re-measured 2026-06-11 via gallery API; last extension update 2025-01-06 — dormant 18 months)                                                                                                                                                                                                                                      | Pins the proven demand floor for WYSIWYG-in-VS-Code                                                                                                                 |
| 4   | markdown-for-humans "younger, less polished" | **4,869 installs**, 5.0★ (re-measured 2026-06-11; last update 2026-05-19 — actively shipping, more update events than installs); dual-published to Open VSX; openly "vibe coded"; explicitly targets Cursor/Windsurf                                                                                                                                        | Beatable on quality; already ahead of Muninn on distribution and accelerating — the activity gap (they ship, zaaack is dormant) matters more than the install delta |
| 5   | "No native VS Code WYSIWYG RFC"              | **False since Feb 2026.** microsoft/vscode **#296639** proposes a built-in `markdown-wysiwyg-editor` (CustomTextEditorProvider, `priority: "option"`, source/visual sync, inline Mermaid). Also #296770 (Obsidian-style) and #303697 (preview-first + inline section editing — nearly Muninn's exact pitch). Nothing shipped; Cursor 3.7 (June 4) unchanged | Platform risk upgraded from theoretical to "actively requested upstream." See §6                                                                                    |
| 6   | CVE-2025-65716 "fresh in memory"             | GHSA still lists **no patched version**; MPE shipped 0.8.26 (~May 16) with unconfirmed remediation; press coverage dormant since Feb                                                                                                                                                                                                                        | The trust story is stronger than assumed — the flagship competitor's vuln is formally unresolved — but the news hook is going stale                                 |
| 7   | Two named direct competitors                 | **Third category of comp:** Mark Sharp (paid license unlock), chance-liu.md-wysiwyg-editor (updated Mar 24, 2026), Typedown (updated Feb 28, 2026)                                                                                                                                                                                                          | A _paid_ entrant validates willingness-to-pay in-category; free + better engineered remains an easy flank                                                           |
| 8   | Muninn at 2.0.0-alpha.1, pre-publish         | Still unpublished. GitHub: 0 stars, 0 forks, latest tagged release v1.0.1 (Dec 2025). Versioning re-schemed 2026-06-11: pre-release = `1.99.x` (the Marketplace rejects `-alpha` suffixes), GA = `2.0.0` — see #243                                                                                                                                         | The strategy's critical path runs through `vsce publish`, not through any feature                                                                                   |

Data: live marketplace page fetches, GHSA advisory, microsoft/vscode issue tracker, vendor changelogs (June 9, 2026). Full citation set in Appendix A of the May brief plus sources listed in §9.

## 3. Features: where Muninn actually stands

The May feature matrix (§4 of the brief) remains accurate row-by-row; nothing shipped in the interim changes a rating. Three findings from today's code-level review sharpen it:

**Engineering quality is a real, verifiable lead.** The webview already does things no direct competitor documents: CSP-nonced scripts, host-side message validation, Mermaid SVG sanitization that strips `script`/`foreignObject`/`iframe` before injection (`src/webview/editor/preview.ts`), workspace-trust gating with an explicit untrusted-workspace opt-in, l10n with HTML escaping, and a revision-aware sync protocol. This substantiates the "trustworthy editor" claim in writing.

**Accessibility is ahead of the category but not yet claimable.** Today's WCAG 2.1 AA audit found a genuinely strong baseline (managed `aria-pressed`, `role="toolbar"`/`role="group"` with labels, live-region status line, labeled table-cell inputs, `:focus-visible` everywhere, theme-token contrast) with 13 findings, 4 of them P1: no arrow-key/roving-tabindex toolbar navigation, Mermaid diagrams render with no text alternative, table grids lack `scope`/caption semantics, and Enter in a table cell drops focus on the floor. Roughly 2–3 evenings of work separates Muninn from being the only markdown editor in the category that can publish a credible accessibility conformance note. The competition is uniformly weak here; this is a cheap, defensible differentiator.

**The remaining gaps are the known ones.** Image paste/insert, math, outline/TOC, GFM callouts, task-list toggle, export. Unchanged from May; the priority order in §7 stands.

## 4. Competitiveness: the honest read

Muninn is simultaneously the best-engineered product in its niche and the least-distributed. Marketplace reality (re-measured 2026-06-11): zaaack proves ~205K users will adopt WYSIWYG-in-VS-Code despite file-churn complaints; markdown-for-humans proves a TipTap/ProseMirror entrant can get listed, get reviewed, and court the Cursor audience with 4.9K installs and visible momentum; Mark Sharp proves some users will _pay_. Muninn, with arguably the strongest correctness and security story of the four, has zero users because it is not installable. Competitiveness in this category is currently determined by who shows up, and Muninn hasn't.

The asymmetry is recoverable because install counts at the bottom of the category are tiny (4.9K) and quality differences are large. But every month of delay raises the bar — and if #296639 graduates to a shipped built-in, the niche stops being winnable by an outsider at all.

## 5. Utility for clients: who actually benefits

Translating the feature set into buyer jobs, in order of market size:

**Developers reading more than writing** — the README/spec/ADR audience. Muninn's reading-first default (custom editor opens rendered, calm surface, escape hatch to source) serves the most common markdown interaction in a workday: opening someone else's doc. Native VS Code serves this with a second "preview" tab and a context switch; Muninn makes it the default state of the file. This is the wedge audience and the demo to lead with.

**Docs-as-code teams** — engineers and adjacent roles (PMs, TWs, support engineers) maintaining markdown in git repos. For them the killer property is the round-trip guarantee: edits produce the diff a human would have produced. This is precisely where zaaack's Vditor engine fails (whole-file churn destroying reviews) and where Muninn's ProseMirror serializer should win — once golden-file tests make the claim provable rather than asserted.

**Mermaid-heavy documentation cultures** — architecture docs, runbooks. Inline insert + live preview + trust gating is already shipped and competitive.

**Non-developer collaborators in repos** — the person who dreads editing raw markdown. The editable table grid with per-cell labels is the single feature this audience will name when recommending the extension. Table UX polish (see design critique: row/column delete, alignment, Enter behavior) compounds directly into word-of-mouth.

**Security-gated organizations** — teams that audit extensions before allowlisting. Muninn's posture (no telemetry, CSP, trust gating, sanitization, CodeQL/Dependabot) is the best in category and worth documenting as a standalone `SECURITY_POSTURE.md`. Note the tension introduced by the license decision below: the organizations most attracted by the security posture overlap heavily with the organizations whose counsel is most allergic to AGPL.

## 6. Platform risk: responding to microsoft/vscode #296639

The right posture is engagement, not denial. Concretely: comment on #296639 and #303697 as a practitioner with a shipped implementation — the maintainer of a ProseMirror-based markdown custom editor has standing in that thread that almost nobody else does, and the thread is read by exactly the audience the personal brand targets. Track the issues monthly for milestone/label changes. Strategically, assume a built-in lands eventually and position Muninn the way GitLens positions against built-in git: the built-in validates the category and serves the median case; the extension wins on depth (tables, Mermaid editing, round-trip guarantees, accessibility, configurability). A Microsoft built-in at `priority: "option"` (per the issue text) would not even take over `.md` defaults — Muninn's default-editor takeover remains a differentiator.

## 7. License: AGPL-3.0 — decided and implemented

The May brief recommended against AGPL and made the full counter-case (§7 there; unchanged in substance — marketplace "Excluded License" signaling, §13 network-clause exposure in code-server/Codespaces/Gitpod environments, categorical enterprise legal rejections, Google's outright ban). The decision maker has reconfirmed AGPL v3 with that case on the table. **Decision recorded: AGPL-3.0-only, effective today.** Implemented in this change set: `LICENSE` replaced with the canonical AGPL-3.0 text and Muninn-specific notice, `package.json` `license` field set to `AGPL-3.0-only`, README license section rewritten with a plain-language summary including the network-use clause.

What makes this defensible rather than merely costly: relicensing was legally clean (sole contributor, 46/46 commits by the copyright holder; all runtime dependencies — ProseMirror, markdown-it, Mermaid — are MIT and compatible with distribution inside an AGPL work), and the license can now do _brand_ work that MIT could not. The brand story writes itself only if told deliberately: Muninn becomes the uncompromisingly-FOSS option in a niche whose alternatives are proprietary (Typora, Mark Sharp's paid unlock), freeware-not-FOSS (Obsidian), or permissively licensed and fork-vulnerable. Logseq and Zettlr demonstrate the audience for that identity. "Why I licensed my VS Code extension AGPL — knowing the cost" is, frankly, a stronger blog post than another MIT announcement, and the blog series is the brand engine.

Operational consequences to execute now:

1. **Keep 100% copyright ownership enforceable.** Adopt DCO sign-off before merging any external PR, and require a lightweight CLA if contributions grow. Sole ownership is what keeps dual-licensing (e.g., a future commercial exception for IDE vendors or hosted environments) and any future relicense possible. This was true under MIT; under AGPL it is existential.
2. **Add SPDX headers** (`SPDX-License-Identifier: AGPL-3.0-only`) to source files, and ship `THIRD_PARTY_NOTICES.md` in the VSIX covering the bundled MIT dependencies (esbuild inlines them into `dist/extension.js`; their notices must travel with the artifact).
3. **Publish to Open VSX in the same release workflow.** Open VSX has no AGPL friction, and it serves the Cursor/VSCodium audience — disproportionately the FOSS-sympathetic users the license now courts.
4. **Preempt the enterprise question in the README.** A short FAQ — "AGPL applies to _distributing modified versions_ of Muninn, including serving modified versions over a network; installing and using the extension to edit your private files imposes nothing on your documents or your employer's code" — defuses the most common misreading before a security reviewer writes the rejection memo. (Generic statement of how the license is commonly understood, not legal advice.)
5. **Accept the known costs with eyes open:** no expectation of marketplace featuring; some enterprises will refuse the install categorically; remote-IDE platform operators (code-server fleets, Codespaces images) become the main compliance-sensitive audience. The adoption targets in §8 absorb a haircut relative to the May (MIT-assumption) targets.
6. **Trademark is unprotected by AGPL.** "Muninn" as a name needs separate handling — at minimum a trademark-usage note; `docs/BRAND_NAMING_CONTRACT.md` is the place.

## 8. Priority stack (supersedes May §8 "Now" ordering)

The May plan gated publishing behind polish. Given §2's findings, invert it:

1. **Publish now.** `vsce publish` the current alpha (with `preview: true`) to the Marketplace and Open VSX this week, warts included. Tag `v1.99.0` on GitHub (odd-minor pre-release scheme — the Marketplace rejects `-alpha` suffixes in the manifest version; decision record in issue #243). An unpublished extension has no funnel, no reviews, no listicle eligibility, and no answer to "show me." Everything below compounds only after this.
2. **Round-trip golden-file tests** for CommonMark + GFM, published as a test report. The headline claim ("the WYSIWYG that doesn't touch your bytes") becomes provable; it's also the pre-emptive defense against the failure mode that defines zaaack's reviews. (`specs/round-trip-correctness/spec.md` already exists — execute it.)
3. **P1 accessibility fixes** (toolbar roving tabindex, Mermaid text alternatives, table semantics, focus retention — per audit doc), then state conformance in the README. Cheapest unclaimed differentiator in the category.
4. **Image paste/drag/insert.** Largest functional gap for the wedge audience; required before any GA claim.
5. **Outline via `DocumentSymbolProvider` + task-list/blockquote/hr commands.** Table-stakes parity, low effort.
6. **README hero rewrite + `SECURITY_POSTURE.md` + AGPL FAQ** (§7.4), then exit `preview` → GA.
7. **Then** the Next-phase items as planned (KaTeX, callouts, HTML export, vscode.dev build, blog series, #296639 engagement per §6).

Success metrics: keep the May targets (5K installs by end of Q3 2026, 50K by Q1 2027, ≥4.5★ post-GA, 1K stars by Q1 2027, OpenSSF ≥7) but recognize the clock starts at first publish, not at the May brief date, and the AGPL haircut applies — treat 50K/Q1 as stretch rather than base case.

## 9. Sources for June refresh

Live fetches 2026-06-09: marketplace.visualstudio.com item pages for the nine extensions in §2; github.com/advisories/GHSA-5cph-5v9q-vh7g; github.com/microsoft/vscode issues #296639, #296770, #303697; cursor.com/changelog (3.7); github.com/bluecloud-dev/muninn-vscode; merge-json-files.com "9 Best Markdown Extensions for VS Code in 2026" (May 26, 2026); learn.microsoft.com Publisher Agreement 8.0; spdx.org AGPL-3.0-only text. Repository evidence: `package.json`, `src/webview/editor/*`, `git shortlog -sn` (46 commits, single author). Prior art: `docs/COMPETITIVE_BRIEF.md`, `docs/STRATEGIC_ROADMAP.md`.

_Licensing statements in §7 describe common practice and the license text; they are not legal advice. For enterprise-facing license questions or the dual-licensing setup, have a software-licensing attorney review._
