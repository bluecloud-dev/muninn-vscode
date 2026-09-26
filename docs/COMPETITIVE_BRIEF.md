# Muninn for VS Code — Competitive Brief (May 2026)

> Historical May 2026 planning snapshot. Its product, version, market, and release claims are not current. See [ROADMAP.md](ROADMAP.md), [ARCHITECTURE.md](ARCHITECTURE.md), and the dated [September implementation record](AUDIT_IMPLEMENTATION_2026-09.md).


> Strategic positioning, feature matrix, and roadmap to take Muninn from `2.0.0-alpha` to a top‑tier VS Code extension that catalyzes Aymen Hammouda's personal brand.
>
> **May 2026 snapshot.** Superseded where it conflicts with `MARKET_POSITION_2026-06.md` and `decisions/`: license is now AGPL-3.0-only (D-006); versioning is `1.99.x` pre-release / `2.0.0` GA (see issue #243).

---

## 1. Executive summary

Muninn occupies a **narrow but real wedge** in the VS Code markdown ecosystem: it is one of only two ProseMirror‑based, single‑pane, WYSIWYG‑style markdown custom editors on the marketplace today. The other (`concretio.markdown-for-humans`) is a younger, less polished competitor; the closest _commercially proven_ peer is `zaaack.markdown-editor` (Vditor wrapper, weaker architecture). Above Muninn sit eight‑figure‑install incumbents that solve adjacent jobs — productivity (`Markdown All in One`), heavyweight preview (`Markdown Preview Enhanced`), export (`Markdown PDF`), linting (`markdownlint`) — and _none of them are direct WYSIWYG competitors_. Below it sit a long tail of decoration‑based and abandoned WYSIWYG attempts.

The honest competitive landscape is:

| Threat tier     | Who                                                        | Why it matters                                    |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| **Existential** | Cursor / VS Code shipping native single‑pane WYSIWYG       | Would absorb the entire category from above       |
| **Direct**      | `concretio.markdown-for-humans` (TipTap/ProseMirror, MIT)  | Same stack, same approach, actively marketed      |
| **Direct**      | `zaaack.markdown-editor` (Vditor)                          | Proven WYSIWYG-in-VS‑Code market exists           |
| **Substitute**  | Plain VS Code + `Markdown All in One` + `markdown-mermaid` | What 95% of developers actually use today         |
| **Indirect**    | Typora ($14.99), Obsidian (proprietary freeware)           | Sets the experiential bar for single‑pane WYSIWYG |

**Verdict:** Muninn can credibly become _the_ top‑tier WYSIWYG markdown extension for VS Code within 6–12 months — the field is unusually thin at the top of its specific niche — but the brand‑building plan and the license choice both need to change. **The current MIT license should stay, or move to Apache 2.0; AGPL v3 is the wrong choice for an adoption‑driven personal‑brand play and is detailed in §7.**

---

## 2. Product snapshot (what Muninn actually is, as of `2.0.0-alpha.1`)

Stripped to first principles, Muninn is:

- A **`CustomTextEditorProvider`** that becomes the default opener for `.md` and `.markdown`.
- A **ProseMirror‑backed webview** doing rich single‑pane editing with a revision‑aware sync protocol to the underlying `TextDocument`.
- A **formatting toolbar** (Text / Structure / Insert groups) covering bold, italic, headings 1–3, paragraph, bullet/numbered lists, links, code blocks.
- **Mermaid block insertion** with inline preview, gated by VS Code workspace trust + an explicit `muninn.integrations.mermaid.allowInUntrustedWorkspaces` setting (defaults off).
- An **editable table node view** with add‑row / add‑column / table‑actions commands.
- **Raw markdown escape hatch** — one command flips you to the source editor.
- **Zero telemetry**, secured webview CSP with nonces, host‑side message validation.
- **Localization scaffolding** via `package.nls.json` and `l10n/`.
- WebdriverIO E2E + Mocha integration tests with CodeQL, Dependabot, OpenSSF‑aligned security hardening.
- MIT‑licensed, hosted at `bluecloud-dev/muninn-vscode`, publisher `blueclouddev`.

What it doesn't yet ship: image insertion, PDF/HTML export, math (KaTeX/MathJax), task list / blockquote / horizontal rule insertion commands, outline panel, search‑in‑rendered‑view, comments, AI assistance, full Notion‑style block parity. The `ROADMAP.md` explicitly excludes export, non‑markdown formats, cloud features, and telemetry.

---

## 3. Competitive landscape map

Two axes that actually separate competitors in this market:

```
                                  WYSIWYG / single‑pane
                                          ▲
                       Typora ●           │             ● Markdown for Humans
                                          │               (concretio)
                                          │
                                          │             ● Muninn (target)
                                          │
                       Obsidian ●         │
                       (Live Preview)     │             ● zaaack.markdown-editor
                                          │               (Vditor)
                                          │
    Outside VS Code  ◄──────────────────  ●  ──────────────────►  Inside VS Code
                                          │
                                          │             ● Markdown All in One
                       Zettlr ●           │               (productivity layer)
                       MarkText ●         │
                       (abandoned)        │             ● Markdown Preview Enhanced
                                          │               (heavyweight preview)
                                          │
                                          │             ● Marp, markdownlint, mermaid-support
                                          │               (specialized)
                                          ▼
                                Source + split preview
```

Muninn's intended position — **top‑right quadrant: WYSIWYG, inside VS Code** — has exactly two named occupants. The category is real (Typora validated it; ~12.5M devs install MAIO suggesting markdown is a daily surface for VS Code users) but undefended.

---

## 4. Feature comparison matrix

Rating: **Strong** (market‑leading) / **Adequate** (functional, undifferentiated) / **Weak** (limited) / **Absent** (not shipped).

| Capability area                              | Muninn (`2.0.0-alpha`) | Markdown All in One      | MPE           | zaaack.markdown-editor | Markdown for Humans | Typora (off‑VS‑Code) | VS Code native preview |
| -------------------------------------------- | ---------------------- | ------------------------ | ------------- | ---------------------- | ------------------- | -------------------- | ---------------------- |
| **Single‑pane WYSIWYG**                      | Strong                 | Absent                   | Absent        | Strong                 | Strong              | Strong               | Absent                 |
| **CustomEditor as default for .md**          | Strong                 | Absent                   | Absent        | Strong                 | Strong              | n/a                  | Absent                 |
| **ProseMirror foundation**                   | Strong                 | Absent                   | Absent        | Absent (Vditor)        | Strong (TipTap)     | n/a                  | Absent                 |
| **Mermaid (inline render)**                  | Adequate               | Absent (pair w/ bierner) | Strong        | Strong                 | Strong              | Strong               | Absent                 |
| **Editable table grid**                      | Adequate               | Weak (auto‑align source) | Absent        | Strong                 | Strong              | Strong               | Absent                 |
| **Math (KaTeX/MathJax)**                     | Absent                 | Adequate                 | Strong        | Adequate               | Adequate            | Strong               | Adequate               |
| **Task list toggle**                         | Absent                 | Strong                   | Strong        | Strong                 | Strong              | Strong               | Adequate               |
| **Image paste / insert**                     | Absent                 | Absent (3rd party)       | Adequate      | Strong                 | Strong              | Strong               | Strong (drag/paste)    |
| **Outline / TOC**                            | Absent                 | Strong                   | Strong        | Adequate               | Adequate            | Strong               | Strong                 |
| **GFM alerts / callouts**                    | Absent                 | Absent                   | Strong        | Adequate               | Adequate            | Adequate             | Strong (since 2024)    |
| **PDF export**                               | Absent                 | Absent (print)           | Strong        | Adequate               | Absent              | Strong               | Absent                 |
| **HTML export**                              | Absent                 | Absent                   | Strong        | Adequate               | Absent              | Strong               | Absent                 |
| **Workspace‑trust security gating**          | Strong                 | Adequate                 | Adequate      | Adequate               | Adequate            | n/a                  | Strong                 |
| **No telemetry**                             | Strong                 | Strong                   | Strong        | Strong (no decl.)      | Strong              | Weak (paid app)      | Adequate (opt‑out)     |
| **Accessibility (keyboard, ARIA, contrast)** | Unverified             | Adequate                 | Weak          | Weak                   | Weak                | Adequate             | Strong                 |
| **vscode.dev / web extension**               | Absent                 | Strong                   | Weak          | Unverified             | Unverified          | n/a                  | Strong                 |
| **i18n / localization**                      | Strong (scaffolded)    | Adequate                 | Adequate      | Weak                   | Weak                | Strong               | Strong                 |
| **Linting / format on save**                 | Absent                 | Adequate                 | Absent        | Absent                 | Absent              | Absent               | Adequate               |
| **Footprint / startup speed**                | Adequate (alpha)       | Strong                   | Weak          | Weak                   | Adequate            | Strong               | Strong                 |
| **License (end‑user friendly)**              | Strong (MIT)           | Strong (MIT)             | Strong (NCSA) | Strong (MIT)           | Strong (MIT)        | Weak (proprietary)   | Strong (MIT)           |

### Where Muninn is genuinely ahead today

The combination _"single‑pane WYSIWYG + ProseMirror correctness + workspace‑trust‑gated Mermaid + revision‑aware sync + zero telemetry + serious test infra"_ exists in **no other extension**. `zaaack.markdown-editor` matches the WYSIWYG mode but its Vditor engine is known for rewriting unfamiliar markdown, churning whole files on every keystroke (catastrophic for git diffs), and lagging upstream. `concretio.markdown-for-humans` matches the stack but ships less mature table/Mermaid behavior, no documented workspace‑trust story, and lighter testing.

### Where Muninn is materially behind

Image insertion, math, outline, GFM callouts, and any export pipeline. These are not just features — they're table‑stakes for the "I switch from MAIO/MPE to Muninn" decision. The 6‑month roadmap (§8) prioritizes these in order of impact‑per‑effort.

---

## 5. Positioning analysis

### What competitors claim

- **MAIO:** _"All you need to write Markdown."_ Owns "productivity layer for source editing."
- **MPE:** _"One of the best markdown preview extensions."_ Owns "heavyweight preview + scientific publishing."
- **zaaack.markdown-editor:** _"Make your VS Code a full‑featured WYSIWYG markdown editor."_ Tries to own WYSIWYG but execution is the gap.
- **Markdown for Humans:** _"True WYSIWYG. 100% free and open‑source. No hidden limits."_ Same niche as Muninn, slightly louder voice.
- **Typora:** _"Live Preview, simple and powerful."_ Owns the _experience_ of WYSIWYG markdown.
- **Obsidian:** _"A second brain, for you, forever."_ Owns local‑first PKM, freeware not FOSS.

### Unclaimed positioning Muninn can own

Three angles are genuinely available:

1. **"The honest WYSIWYG."** Muninn writes back the exact markdown you'd write by hand — no Vditor‑style file churn, no Notion‑style lossy export, no Obsidian wikilink lock‑in. CommonMark + GFM in, byte‑for‑byte CommonMark + GFM out. This is a real technical claim Muninn can substantiate through golden‑file round‑trip tests and is _exactly_ the failure mode that gets `zaaack.markdown-editor` 1‑star reviews.

2. **"The trustworthy editor."** Workspace‑trust‑gated Mermaid, CSP‑hardened webview, host‑side message validation, no telemetry, CodeQL + Dependabot enforced. The category just had a CVSS 8.8 disclosure (CVE‑2025‑65716, Markdown Preview Enhanced, Feb 2026) and the public memory is fresh. Muninn can credibly stand on the security ground that MPE just slipped on.

3. **"Reading‑first."** This is the existing brand line and it is good but undersold. Most WYSIWYG markdown tools (Notion, Obsidian, even Typora) optimize for _writing_. Muninn's `package.nls.json` description _"single‑pane markdown editor for reading‑first workflows"_ claims a different angle — the case where you open a teammate's spec, a long README, an ADR, and you want a calm reading surface that you can _also_ edit. This is the demo to lead with.

### Vulnerable competitor claims

- **MPE's "best preview"** — newly damaged by the CVE.
- **zaaack's "full‑featured WYSIWYG"** — undermined by recurring "Vditor rewrote my file" complaints.
- **Obsidian's "freeware feels FOSS"** — increasingly under scrutiny in 2026 as Logseq (AGPL) and Zettlr (GPL) make genuinely FOSS claims.
- **Notion's "markdown export"** — structurally lossy; this is a community joke at this point.

---

## 6. Trend analysis (signals worth acting on)

| Trend                                                                   | Signal strength                  | Implication for Muninn                                               | Recommended response                                                                                                                                                                         |
| ----------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI‑native authoring** (Obsidian Copilot, Cursor docs, Smart Composer) | Strong                           | Shipping a markdown editor in 2026 without an AI hook is conspicuous | **Fast‑follow.** Add an optional, BYO‑model AI sidebar in v2.3 — explain/summarize selection, generate Mermaid from prose. Keep model calls user‑initiated; do not embed a default provider. |
| **Single‑pane WYSIWYG validation**                                      | Strong                           | The bet is sound                                                     | **Lead.** Double down on round‑trip correctness as the headline claim.                                                                                                                       |
| **Local‑first + privacy wedge**                                         | Strong                           | "No telemetry" is now a _wedge_, not hygiene                         | **Lead.** Make it a homepage claim with a `SECURITY.md` link.                                                                                                                                |
| **CommonMark+GFM standardization**                                      | Strong                           | Resist proprietary syntax                                            | **Monitor.** Don't add wikilinks or Notion‑style blocks.                                                                                                                                     |
| **Block‑based editing** (Notion, BlockNote)                             | Medium                           | Wrong paradigm for git‑native workflows                              | **Ignore.** Stay text‑first.                                                                                                                                                                 |
| **Cursor / VS Code shipping native WYSIWYG**                            | Medium (existential if it lands) | The only real category‑collapse risk                                 | **Monitor weekly.** Maintain a fork‑resilient codebase; consider proactively contributing patches upstream to VS Code's preview if a single‑pane mode is RFC'd.                              |
| **VS Code extension security headlines**                                | Strong                           | Public trust is rebuilding                                           | **Lead.** Publish a security posture page; offer to be a reference implementation of trust‑gated extensions.                                                                                 |
| **`open-vsx.org` parity** for Cursor/Codium ecosystems                  | Medium                           | Cursor users can't install marketplace‑only extensions               | **Fast‑follow.** Publish to Open VSX as part of release pipeline.                                                                                                                            |

---

## 7. License recommendation: do **not** move to AGPL v3

You asked for AGPL v3. The brand goal is "catalyst for personal brand." Those two are in tension, and you should hear the case before deciding.

**The marketplace technicality.** Microsoft's Publisher Agreement 8.0 (Sept 2025) classifies AGPL as an "Excluded License." Read narrowly that clause governs rights granted _to Microsoft_, not the license shipped to users — AGPL extensions are publishable and several exist (Element, Bitwarden ecosystems, OpenObserve, some Cline forks). But the existence of that clause is itself a signal: Microsoft does not want AGPL in the marketplace. Don't expect featured placement.

**The §13 trip wire that actually matters.** AGPL's network‑use clause does not normally fire for a local extension manipulating local files — but it _does_ fire when Muninn runs inside `code-server`, GitHub Codespaces, Coder, Gitpod, or any browser‑delivered VS Code. The platform operator now arguably owes corresponding source to every user of that environment. This is the single reason **enterprise legal teams reject AGPL extensions categorically**, not case‑by‑case. Google's public OSS policy bans AGPL outright. Most F500 legal teams treat AGPL extensions as procurement tickets, not one‑click installs.

For a personal‑brand play that depends on _"my colleagues installed this and it made my day better"_ spreading inside enterprises, AGPL is a direct hit to the propagation mechanism.

**It does not protect what you think it protects.** A fork (Cursor, Windsurf, a competitor) can take Muninn under AGPL, ship it, and you have no recourse beyond "they must publish their changes." That is real but narrow. It does not prevent forks; it does not prevent embedding in derivative IDEs (the GPL FAQ's "communicates via well‑defined interface" carve‑out applies — the VS Code extension API is the textbook example). What AGPL prevents is a vendor wrapping Muninn into a closed, hosted, paid product **without contributing back** — and _you don't have that threat model_. Muninn is a free local extension; there is no AWS Muninn for AGPL to fend off.

**The Plausible analogy doesn't transfer.** Plausible chose AGPL to keep Amazon from launching "Amazon Plausible Analytics." Plausible is a hosted SaaS competing with Google Analytics. Muninn is a local extension. Apples and bowling balls.

### Concrete license recommendation

1. **Default: stay MIT, or migrate to Apache 2.0.** Apache 2.0 over MIT only because it adds an explicit patent grant and trademark protection on "Muninn" — both useful for a personal brand. Zero adoption tax. This is what GitLens, Prettier, ESLint, and every adoption‑winning VS Code extension uses.
2. **If you really want copyleft, take MPL 2.0, not AGPL.** File‑level copyleft means a vendor can't ship a closed fork of _Muninn's own files_, but they can wrap surrounding code freely. You get 80% of AGPL's "no closed forks" protection at 10% of the enterprise friction.
3. **Set up a lightweight CLA (DCO sign‑off) now.** If you later decide to dual‑license or relicense, you need 100% copyright control. The moment you merge an outside PR without a CLA, that option silently disappears. DCO sign‑off (one git config line per contributor) is the lowest‑friction option and is what the Linux kernel uses.
4. **Reserve a future relicense for when it has a reason.** If you ever launch a hosted Muninn Cloud (sync, AI), the _Functional Source License_ (BSL‑style, auto‑converts to Apache 2.0 after 2 years) is the modern playbook. Don't preemptively burn adoption now for a moat you don't yet need.

If after all of this you still want AGPL for ideological reasons, that is a defensible choice — but go in with eyes open that you are trading _adoption_ (which fuels personal brand) for _strict copyleft_ (which fuels a specific kind of ideological credibility).

---

## 8. Roadmap to top‑tier (0–12 months)

The bar for "top‑tier VS Code extension" in this category is roughly: ≥4.5★ rating, ≥250k installs, an ecosystem of bloggers/youtubers covering it, and a credible answer in every "best markdown editor for VS Code 2026" listicle. Mapping there from `2.0.0-alpha`:

### Now (0–6 weeks): exit alpha cleanly

1. **Round‑trip correctness as a feature.** Ship golden‑file tests that prove `markdown → ProseMirror → markdown` is byte‑identical for the entire CommonMark + GFM spec. Publish the test report. Make it the #1 listing claim: _"The WYSIWYG that doesn't touch your bytes."_
2. **Image insertion command.** Highest‑impact missing feature per matrix gap. Match VS Code native preview behavior (configurable destination folder, paste from clipboard, drag‑and‑drop).
3. **Task list, blockquote, horizontal rule commands.** Already in roadmap. Cheap parity wins.
4. **Outline panel integration.** Use VS Code's `DocumentSymbolProvider` — minimal effort, table‑stakes UX.
5. **Hero asset and README rewrite.** A 30‑second GIF showing the live round‑trip and Mermaid editing is worth more than five paragraphs of copy. Lead with the trust + round‑trip claim.
6. **Accessibility audit.** Run a WCAG 2.1 AA pass on the webview now, before user counts grow and the audit gets expensive. Specifically: keyboard navigation for table actions, focus management on Mermaid block insertion, ARIA roles on toolbar groups, contrast on the toolbar in both VS Code Light and Dark+ themes, screen‑reader announcements on mode toggles. Publish the result as a badge in the README — the category does this badly and Muninn can lead. This converts your `/design:accessibility-review` ask into a concrete v2.0 gate.

### Next (6 weeks – 6 months): differentiate

7. **Math (KaTeX) support.** Major gap vs MPE, MAIO, every paid editor.
8. **GFM alerts / callouts** (`> [!NOTE]`, `[!WARNING]`, etc.). Native VS Code preview shipped this in 2024; users now expect it.
9. **HTML export.** PDF requires Chromium and is a security/footprint headache (see Markdown PDF issues). HTML export is ~80% of the use cases with ~10% of the cost.
10. **Open VSX publishing pipeline.** Cursor and VSCodium users can install today only if a build is on Open VSX. Add to CI release workflow.
11. **vscode.dev / web extension support.** Audit feature surface; ship a "Muninn Lite" web build even if Mermaid and table actions remain desktop‑only.
12. **Security marketing.** Publish `docs/SECURITY_POSTURE.md`: workspace trust matrix, CSP nonce strategy, message validation, dependency audit cadence, CodeQL findings dashboard. This is a concrete claim no current competitor can match in writing.
13. **Design critique cycle.** Run a structured `design-critique` on toolbar layout, mode switching, and the empty‑document state — this converts your `/design:design-critique` ask into shipped UX improvements rather than a one‑shot review.

### Later (6–12 months): catalyze brand

14. **AI assist sidebar (optional, BYO‑key).** Anthropic / OpenAI / local‑model agnostic. Three commands to start: _Explain selection_, _Summarize section_, _Mermaid from description_. Never call without user action; never embed a default model; document the data flow.
15. **A blog series, not a blog post.** "Why I built Muninn," "Round‑trip correctness in ProseMirror," "Workspace trust for webview extensions," "Why MIT and not AGPL." Each post is a distinct hook into the personal brand and a search‑engine landing surface.
16. **Conference / community signal.** Submit a lightning talk to a VS Code, ProseMirror, or open‑source community event on one of the technical posts above. Speakers get cited; cited extensions get installed.
17. **Cursor/Windsurf compatibility tier.** Document working configurations explicitly. The audience that complains hardest on Twitter about extension portability is also the audience that produces the most evangelism.

### Success metrics (revisit quarterly)

- **Installs:** 5k by end of Q3 2026, 50k by end of Q1 2027.
- **Rating:** ≥4.5★ once the marketplace allows reviews (post‑GA exit from `preview: true`).
- **Outbound mentions:** 3+ independent blog posts / videos / listicles by end of 2026.
- **GitHub:** 1k stars by Q1 2027, ≥10 external contributors with merged PRs.
- **Security:** zero CVEs, OpenSSF Scorecard ≥7.

---

## 9. Risks and how to mitigate

| Risk                                               | Likelihood                             | Severity    | Mitigation                                                                                                                       |
| -------------------------------------------------- | -------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Cursor or VS Code ships native single‑pane WYSIWYG | Medium                                 | Existential | Stay close to upstream RFCs; build credibility via security + round‑trip claims so users want Muninn even when a built‑in exists |
| `concretio.markdown-for-humans` out‑markets Muninn | Medium                                 | High        | Ship the security posture page and round‑trip test report first; both are claims they can't credibly make                        |
| A CVE‑2025‑65716 ‑style disclosure against Muninn  | Low (high security investment)         | High        | Continue current Dependabot + CodeQL cadence; quarterly third‑party review of webview message bridge                             |
| Enterprise blocks install due to license confusion | Low if Apache 2.0; **high if AGPL v3** | High        | Stay MIT / Apache 2.0 (see §7)                                                                                                   |
| Maintainer burnout / bus factor                    | Medium                                 | High        | DCO sign‑off CLA + documented governance + invite 1–2 trusted maintainers post‑GA                                                |
| Marketplace preview flag suppresses adoption       | Current state                          | Medium      | Plan the `preview: false` exit explicitly with §8 Now items as gating criteria                                                   |
| Vditor‑style file churn appears in Muninn          | Low (ProseMirror correctness)          | High        | Lock in golden‑file round‑trip tests in CI                                                                                       |

---

## 10. Recommendation summary

1. **Keep MIT or migrate to Apache 2.0.** Skip AGPL v3.
2. **Position on "honest WYSIWYG + trustworthy editor + reading‑first."** Three claims, all defensible.
3. **Ship golden‑file round‑trip tests, an accessibility audit, image insertion, and an Open VSX build before exiting alpha.** These five items collectively unlock the "top‑tier" listing position.
4. **Lead the security narrative.** The category just took a public hit; Muninn already has the engineering to claim the high ground in writing.
5. **Build a content trail, not a feature list.** A blog series + a conference talk + listicle outreach moves the personal‑brand needle further than a fifteenth toolbar command.
6. **Reserve future commercial optionality with a DCO‑based CLA today.** Costs nothing now, preserves everything later.

The category's incumbent leaders (MAIO at 12.5M, MPE at 8.5M) are not direct competitors — they're solving adjacent jobs and have aged into maintenance mode. The direct competitors are immature. The window to plant a flag in _"the WYSIWYG markdown extension for VS Code"_ is open in 2026; it will not stay open forever, and the closing event is most likely Cursor or VS Code itself shipping a built‑in mode. Move now.

---

## Appendix A — Source citations

VS Code Marketplace:

- [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)
- [Markdown Preview Enhanced](https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced)
- [Markdown Editor (zaaack)](https://marketplace.visualstudio.com/items?itemName=zaaack.markdown-editor)
- [Markdown for Humans (concretio)](https://marketplace.visualstudio.com/items?itemName=concretio.markdown-for-humans)
- [Markdown Preview Mermaid Support (bierner)](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)
- [Markdown PDF (yzane)](https://marketplace.visualstudio.com/items?itemName=yzane.markdown-pdf)
- [markdownlint (DavidAnson)](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint)
- [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode)
- [Foam](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode)

Security disclosure:

- [Critical Flaws in Four VS Code Extensions with 125M+ Installs (The Hacker News, Feb 2026)](https://thehackernews.com/2026/02/critical-flaws-found-in-four-vs-code.html)

Engines and frameworks:

- [ProseMirror](https://prosemirror.net/)
- [Vditor](https://github.com/Vanessa219/vditor)
- [TipTap](https://tiptap.dev/)

VS Code platform:

- [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Markdown in VS Code](https://code.visualstudio.com/docs/languages/markdown)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)

Indirect competitors:

- [Obsidian](https://obsidian.md/) · [Typora Store](https://store.typora.io/) · [Zettlr](https://www.zettlr.com/) · [Logseq](https://logseq.com/) · [Joplin](https://joplinapp.org/) · [Inkdrop](https://www.inkdrop.app/) · [iA Writer](https://ia.net/writer) · [Notion markdown export issues](https://unmarkdown.com/blog/notion-export-broken)

Adjacent:

- [Cursor forum — inline WYSIWYG discussion](https://forum.cursor.com/t/inline-markdown-preview-mode-is-hard-disabled-for-md-files-in-claude-directory-due-to-bundled-exclusion-list/158562)
- [Zed Markdown docs](https://zed.dev/docs/languages/markdown)
- [JetBrains Markdown](https://www.jetbrains.com/help/idea/markdown.html)
- [vscode.dev](https://vscode.dev/)
- [Quarto 1.9](https://quarto.org/docs/blog/posts/2026-03-24-1.9-release/)

License:

- [Microsoft Publisher Agreement 8.0](https://learn.microsoft.com/en-us/legal/marketplace/msft-publisher-agreement)
- [Google AGPL Policy](https://opensource.google/documentation/reference/using/agpl-policy)
- [Plausible — Why AGPL](https://plausible.io/blog/open-source-licenses)
- [Sentry — Functional Source License](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/)
- [GNU AGPL (Wikipedia)](https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License)
- [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
- [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)

Internal project context:

- `package.json`, `package.nls.json`, `README.md`, `CHANGELOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/MIGRATION_FROM_MARKDOWN_PREVIEW.md`
