# Architect Nested Loading

- If user requests AD2 plus per-domain sections:
  - Load `AD2_FEAXXXX_FULL.md` first, then only required domain templates.

- If user requests ADR after AD2:
  - Load ADR template after AD2 summary is available.

- If user requests end-to-end package:
  - Use orchestrator and phase templates sequentially, one phase at a time.
