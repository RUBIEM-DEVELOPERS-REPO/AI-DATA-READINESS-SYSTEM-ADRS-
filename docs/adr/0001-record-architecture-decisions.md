# 1. Record Architecture Decisions

Date: 2026-07-19

## Status

Accepted

## Context

We need to establish a lightweight Architecture Decision Record (ADR) system for the repository to track critical design iterations, security enhancements, and scaling decisions.

## Decision

We will use the standard ADR format to document architecture choices. The records will be stored as Markdown files in the `docs/adr/` directory, following a sequential numbering naming scheme: `XXXX-title-of-adr.md`.

## Consequences

- Improved transparency on why design choices were made (e.g. choice of pgvector vs external vector stores, local magic-byte malware scanner vs ClamAV).
- Easier onboarding of new developers/analysts.
- Consistent history of compliance and security hardening reviews.
