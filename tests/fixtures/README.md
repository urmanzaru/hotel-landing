# Fixtures

`api/` contiene respuestas **sintéticas**, construidas a mano a partir de `api-endpoints.md` (no son datos reales).
Incluyen a propósito los casos incómodos: datos fiscales y otro hotel (que nunca deben llegar al snapshot), un tipo
de habitación inactivo, nombres duplicados, `chargeType` como texto, textos sin traducción al inglés y elementos
inválidos.

Para grabar respuestas reales ya sanitizadas (solo el hotel elegido y sin RFC ni razón social):

```bash
npm run api:verify -- --record   # escribe en tests/fixtures/recorded/
```
