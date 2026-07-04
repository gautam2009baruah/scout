# Tax Nested Loading

Use nested loads only when needed.

- If input contains "advanced", "edge case", "multi-season", or "performance bottleneck":
  - Load `TAX_CALCULATION_SHOPPING_AVAILABILITY.md` after `TAX_CALCULATION_SHOPPING_QUICK_GUIDE.md`.

- If input requests exact class/method signatures:
  - Keep developer guide loaded and run targeted symbol checks.

- If input asks only for definitions:
  - Do not load deep shopping or developer assets.
