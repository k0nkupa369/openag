# Vector memory: sqlite-vec + Ollama (verified for OA-108)

Checked 2026-10-27 against the installed sqlite-vec 0.1.9 (real queries) and Ollama's API docs.

## sqlite-vec (real queries in a scratch db)
- `CREATE VIRTUAL TABLE vec_chunks_<dim> USING vec0(embedding float[<dim>])`. One table per embedding dimension.
- Insert: `INSERT INTO vec_chunks_<dim>(rowid, embedding) VALUES (?, ?)`. **rowid must be a `BigInt`** with better-sqlite3 (a plain number throws "Only integers are allows for primary key values"). The vector is a Buffer over a `Float32Array`.
- KNN: `SELECT rowid, distance FROM vec_chunks_<dim> WHERE embedding MATCH ? AND k = ? ORDER BY distance`. Distance is L2 (so normalise vectors to unit length to make it behave like cosine). The KNN cannot be filtered by a column here, so oversample `k` and filter by bot/model in JS.
- Delete: `DELETE FROM vec_chunks_<dim> WHERE rowid = ?` (BigInt) works.
- Wrong-dimension insert throws "Dimension mismatch ... Expected N dimensions".

## Ollama embeddings
- `POST http://127.0.0.1:11434/api/embed` with `{ "model": "...", "input": "text" | ["text", ...], "truncate": true }` -> `{ model, embeddings: number[][], total_duration, load_duration, prompt_eval_count }`. Docs don't say whether vectors are normalised: normalise ourselves.
- A model that is not pulled returns `{"error":"model '<name>' not found"}` (seen on this machine). Treat any error as a soft failure.
- When Ollama is not running, the error names the cause and where it looked: `embedding failed: Ollama is not reachable at http://127.0.0.1:11434 (ECONNREFUSED)` (origin only, never credentials or a path). This wording is used only for refused, unknown-host and unreachable-network errors. Other connection errors keep their code, such as `request failed (ECONNRESET)` for a dropped connection. Errors are logged at most once a minute, and pending chunks are embedded when Ollama returns. While Ollama is down, memory search returns no results without an error to the bot.
- This machine's Ollama only has a chat model (`huihui_ai/qwen3.5-abliterated:9b`). Real embeddings need an embedding model, default `nomic-embed-text` (768 dims, ~270 MB), set with `OPENAG_EMBED_MODEL`. The user must approve the `ollama pull`.

## Real run (OA-108 acceptance, 2026-10-27)
- `ollama pull nomic-embed-text` (274 MB, approved by the user). Real `/api/embed` returns 768-dim vectors that are already unit length (norm 1.000); we normalise anyway.
- Turn 1 via the real daemon ("remember: my dog is called Biscuit") -> `memory_chunks` had the MEMORY.md chunk and the `thread` chunk, both `embedding_model = nomic-embed-text`, `dim = 768`, 2 rows in `vec_chunks_768`.
- Daemon restarted (so the ACP conversation is gone), then "What is my dog called?" -> boss answered **Biscuit**: only vector recall can supply that.

## Diagnosing embedding failures

Repeated `vector memory ... failed (will retry)` lines in the service log usually mean Ollama was not running for a while. The Ollama desktop app, unlike a service, is not always running. To check the current state:
- `GET /memory/search?bot=<id>&q=<text>` (owner/Full) returns results when embedding works now.
- Pending chunks are rows in `memory_chunks` with no `embedding_model`. They are embedded once Ollama answers, so none should remain after it is back.
