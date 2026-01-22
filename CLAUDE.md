# CLAUDE.md

Instructions

- Load AGENT_SUMMARY.md into context for information about this repository.

Purpose

- Capture concise preferences for the CLAUDE agent when editing/adding code in this repository.

Core coding preferences (conservative defaults)

- Prefer classes over plain objects for domain logic; use methods to encapsulate behavior.
- Respect encapsulation: prefer private fields (# or closures), getters/setters, and methods over exposing mutable internals.
- Favor small, single-responsibility classes and functions; keep public surfaces minimal and explicit.
- Use clear, descriptive names; prefer clarity over cleverness.

Documentation and comments

- Keep comments brief and focused (why over how). Use concise JSDoc for public APIs only.
- Prefer self-documenting names; add short examples for non-obvious behaviors.

Testing, PRs, and style

- Add or update tests for behavioral changes; prefer small, reviewable PRs.
- Follow existing linter/formatting rules; propose tooling changes explicitly before enforcing them.

Security and secrets

- Never commit secrets; prefer environment variables and clear notes about required secrets.

When updating code, the agent should

- Make minimal, surgical changes and explain trade-offs in the commit/PR message.
- Ask clarifying questions when scope or design choices are ambiguous.
