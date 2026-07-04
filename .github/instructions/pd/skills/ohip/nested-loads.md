# OHIP Nested Loading

- If input mentions "existing action" or "already implemented":
  - Load `OHIP_ACTION_REGISTRY.md` after overview.

- If input is implementation + missing YAML fields:
  - Load `preflight.md` and input template next.

- If input asks for testing specifics:
  - Load `testing.md` only after selecting a primary implementation mode.

- If input asks for final readiness:
  - Load `validate.md` only after implementation guidance is complete.
