globalThis.RELAY_RAG = (() => {
  const DB_NAME = "relay-memory-rag";
  const DB_VERSION = 1;
  const EMBEDDING_MODEL = "text-embedding-3-small";
  const MAX_CHUNK_LENGTH = 1100;
  const CHUNK_OVERLAP = 160;
  const MIN_SIMILARITY = 0.28;
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("chunks")) {
          const store = database.createObjectStore("chunks", { keyPath: "id" });
          store.createIndex("parentId", "parentId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open the local search index."));
    });
    return databasePromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Local search index operation failed."));
    });
  }

  function splitText(text) {
    const normalized = String(text || "").replace(/\r/g, "").trim();
    if (!normalized) return [];
    const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const chunks = [];
    let current = "";
    const append = (part) => {
      let remaining = part;
      while (remaining.length > MAX_CHUNK_LENGTH) {
        const boundary = remaining.lastIndexOf(" ", MAX_CHUNK_LENGTH);
        const end = boundary > MAX_CHUNK_LENGTH * 0.55 ? boundary : MAX_CHUNK_LENGTH;
        const piece = remaining.slice(0, end).trim();
        if (piece) chunks.push(piece);
        remaining = remaining.slice(Math.max(0, end - CHUNK_OVERLAP)).trim();
      }
      return remaining;
    };
    for (const paragraph of paragraphs) {
      if (current && current.length + paragraph.length + 2 > MAX_CHUNK_LENGTH) {
        const tail = append(current);
        if (tail) chunks.push(tail);
        current = tail.slice(-CHUNK_OVERLAP);
      }
      const next = current ? `${current}\n\n${paragraph}` : paragraph;
      if (next.length > MAX_CHUNK_LENGTH) {
        current = append(next);
      } else current = next;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  async function hashSource(source, parts) {
    const value = JSON.stringify({ model: EMBEDDING_MODEL, parentId: source.parentId, kind: source.kind, parts });
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function embed(apiKey, inputs) {
    if (!apiKey) throw new Error("Add an OpenAI API key in Privacy & data to build the search index.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs, encoding_format: "float" })
      });
      if (!response.ok) throw new Error(`Embedding service returned HTTP ${response.status}.`);
      const result = await response.json();
      const vectors = (result.data || []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
      if (vectors.length !== inputs.length || vectors.some((vector) => !Array.isArray(vector))) {
        throw new Error("Embedding service returned an incomplete result.");
      }
      return vectors;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Embedding request timed out. Try again.");
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async function chunksForParent(database, parentId) {
    const transaction = database.transaction("chunks", "readonly");
    const store = transaction.objectStore("chunks");
    return requestResult(store.index("parentId").getAll(IDBKeyRange.only(parentId)));
  }

  async function replaceParent(database, parentId, records) {
    const previous = await chunksForParent(database, parentId);
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("chunks", "readwrite");
      const store = transaction.objectStore("chunks");
      previous.forEach((item) => store.delete(item.id));
      records.forEach((item) => store.put(item));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not update the local search index."));
      transaction.onabort = () => reject(transaction.error || new Error("Local search index update was cancelled."));
    });
  }

  async function removeParent(database, parentId) {
    const previous = await chunksForParent(database, parentId);
    if (!previous.length) return;
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("chunks", "readwrite");
      const store = transaction.objectStore("chunks");
      previous.forEach((item) => store.delete(item.id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not update the local search index."));
      transaction.onabort = () => reject(transaction.error || new Error("Local search index update was cancelled."));
    });
  }

  async function indexSource(database, source, apiKey) {
    const parts = splitText(source.content);
    const hash = await hashSource(source, parts);
    const old = await chunksForParent(database, source.parentId);
    if (old.length && old.every((item) => item.sourceHash === hash && item.model === EMBEDDING_MODEL) && old.length === parts.length) {
      if (JSON.stringify(old[0].metadata) !== JSON.stringify(source.metadata)) {
        await replaceParent(database, source.parentId, old.map((item) => ({ ...item, metadata: source.metadata })));
      }
      return { changed: false, chunks: old.length };
    }
    const vectors = [];
    for (let offset = 0; offset < parts.length; offset += 64) {
      vectors.push(...await embed(apiKey, parts.slice(offset, offset + 64)));
    }
    const records = parts.map((content, index) => ({
      id: `${source.parentId}:${index}`,
      parentId: source.parentId,
      sourceHash: hash,
      model: EMBEDDING_MODEL,
      content,
      embedding: vectors[index],
      kind: source.kind,
      metadata: source.metadata
    }));
    await replaceParent(database, source.parentId, records);
    return { changed: true, chunks: records.length };
  }

  async function syncSources(sources, apiKey) {
    const database = await openDatabase();
    const activeIds = new Set(sources.map((item) => item.parentId));
    let indexed = 0;
    let changed = 0;
    for (const source of sources) {
      const result = await indexSource(database, source, apiKey);
      indexed += result.chunks;
      if (result.changed) changed++;
    }
    const transaction = database.transaction("chunks", "readonly");
    const all = await requestResult(transaction.objectStore("chunks").getAll());
    const staleParents = new Set(all.map((item) => item.parentId).filter((parentId) => !activeIds.has(parentId)));
    for (const parentId of staleParents) await removeParent(database, parentId);
    return { indexed, sources: sources.length, changed, removed: staleParents.size };
  }

  function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return -1;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index++) {
      dot += left[index] * right[index];
      leftNorm += left[index] * left[index];
      rightNorm += right[index] * right[index];
    }
    return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : -1;
  }

  async function search(query, apiKey, options = {}) {
    const cleanQuery = String(query || "").trim().slice(0, 6000);
    if (!cleanQuery) return { memories: [], excerpts: [] };
    const database = await openDatabase();
    const transaction = database.transaction("chunks", "readonly");
    const all = await requestResult(transaction.objectStore("chunks").getAll());
    if (!all.length) return { memories: [], excerpts: [], indexedCount: 0 };
    const [queryVector] = await embed(apiKey, [cleanQuery]);
    const sorted = all.map((item) => ({ ...item, score: cosineSimilarity(queryVector, item.embedding) }))
      .filter((item) => item.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score);
    const seenMemories = new Set();
    const chatChunkCounts = new Map();
    const memories = [];
    const excerpts = [];
    for (const item of sorted) {
      if (item.kind === "memory") {
        if (seenMemories.has(item.parentId) || memories.length >= (options.maxMemories ?? 3)) continue;
        seenMemories.add(item.parentId);
        memories.push({ ...item.metadata, score: item.score });
      } else if (item.kind === "chat") {
        const count = chatChunkCounts.get(item.parentId) || 0;
        if (count >= 2 || excerpts.length >= (options.maxExcerpts ?? 4)) continue;
        chatChunkCounts.set(item.parentId, count + 1);
        excerpts.push({ text: item.content, ...item.metadata, score: item.score });
      }
      if (memories.length >= (options.maxMemories ?? 3) && excerpts.length >= (options.maxExcerpts ?? 4)) break;
    }
    return { memories, excerpts, indexedCount: all.length };
  }

  async function clear() {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction("chunks", "readwrite");
      transaction.objectStore("chunks").clear();
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not clear the local search index."));
    });
  }

  async function count() {
    const database = await openDatabase();
    const transaction = database.transaction("chunks", "readonly");
    return requestResult(transaction.objectStore("chunks").count());
  }

  return { splitText, syncSources, search, clear, count };
})();
