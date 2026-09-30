# Muninn Brand Naming Contract

## Purpose

This document defines canonical naming for the Muninn suite and prevents drift across repositories, marketplaces, release notes, and in-product UI.

## Core Brand Decisions

* Masterbrand: **Muninn**
* Brand model: **Masterbrand + suffix**
* Tagline: **Remember everything.**
* Logo system: **One core crow mark across all products**

## Product Names

| Surface | Canonical Name | Notes |
| --- | --- | --- |
| Suite umbrella | `Muninn` | Use in strategy docs and cross-product pages |
| Cross-platform app (mobile/web/desktop) | `Muninn` | App display name remains `Muninn` |
| VS Code extension display name | `Muninn for VS Code` | Use for marketplace and command category |

## Canonical IDs

| Surface | Canonical ID / Namespace | Status |
| --- | --- | --- |
| VS Code extension ID | `bluecloud-dev.muninn-vscode` | Active |
| VS Code package name | `muninn-vscode` | Active |
| VS Code command/config/context prefix | `muninn.*` | Active |
| Legacy extension ID | `blueclouddev.markdown-preview` | Deprecated migration path only |
| Legacy prefix | `markdownReader.*` | Deprecated, hard break in v2 |
| Android app ID | `com.muninn.app` | Active baseline |
| App web manifest/app title | `Muninn` | Active baseline |

## Suffix Rules

* Use `for VS Code` when the platform must be explicit.
* Do not add ad-hoc product labels (`Preview`, `Reader`) to the extension name.
* For app surfaces, use `Muninn` unless store policy requires extra disambiguation.

## Logo Usage Rules

* Use the same crow symbol across mobile, desktop, web, and VS Code.
* # Keep geometry and silhouette unchanged.
* Platform-specific lockups may add text, but not alternate symbols.

## Reserved Legacy Names (Do Not Use)

Do not use the following names in new UI, docs, release notes, or metadata:

* `Markdown Preview`
* `Markdown Reader`

Exception:

* Migration-only contexts that explicitly document legacy behavior or old extension IDs.

## Migration Communication Policy

When referring to legacy names, always include canonical replacement:

* `blueclouddev.markdown-preview` → `bluecloud-dev.muninn-vscode`
* `markdownReader.*` → `muninn.*`