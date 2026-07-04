# SynxisNom Nested Loading

- If input asks "what is APP-X" and then asks "where is it in solution":
  - Load discovery dictionary first, then solution map.

- If input starts with an alias or short service name and then asks for exact app metadata:
  - Load discovery dictionary first, then app registry.

- If input asks only acronym expansion:
  - Load discovery dictionary only.

- If input asks for complete domain inventory:
  - Load overview, then app registry (do not load solution map unless path questions appear).

- If input is part of a compound design or impact workflow:
  - Return canonical IDs, domain ownership, and search expansion terms before any broader search step.
