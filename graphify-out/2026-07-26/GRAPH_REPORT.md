# Graph Report - .  (2026-07-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 572 nodes · 612 edges · 71 communities (44 shown, 27 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- scripts
- tasks
- CoreController
- extension/package.json
- dependencies
- service.ts
- What You Must Do When Invoked
- database/package.json
- web/package.json
- compilerOptions
- worker/package.json
- api/package.json
- extension/manifest.json
- public/manifest.json
- compilerOptions
- ai/package.json
- compilerOptions
- api/tsconfig.json
- graphify reference: extra exports and benchmark
- config/package.json
- contracts/package.json
- ui/package.json
- worker/tsconfig.json
- ai/src/index.ts
- database/tsconfig.json
- graphify reference: query, path, explain
- eslint-config/package.json
- pdf/package.json
- pricing/package.json
- testing/package.json
- validation/package.json
- content.tsx
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- typescript-config/package.json
- layout.tsx
- page.tsx
- TGS Smart Quotes
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- graphify
- base.json
- TGS Smart Quotes
- next-env.d.ts
- .claude/CLAUDE.md
- extraction-spec.md
- AI.md
- API.md
- ARCHITECTURE.md
- BACKUP_RESTORE.md
- BUSINESS_RULES.md
- DATABASE.md
- DECISIONS.md
- DEPLOYMENT.md
- EXTENSION.md
- GRAPHIFY.md
- PDF.md
- QA_CHECKLIST.md
- config/src/index.ts
- seed.ts
- testing/src/index.ts
- ui/src/index.ts

## God Nodes (most connected - your core abstractions)
1. `CoreController` - 27 edges
2. `CoreService` - 27 edges
3. `What You Must Do When Invoked` - 12 edges
4. `/graphify` - 11 edges
5. `json()` - 10 edges
6. `compilerOptions` - 10 edges
7. `scripts` - 10 edges
8. `compilerOptions` - 9 edges
9. `graphify reference: extra exports and benchmark` - 8 edges
10. `normalizeText()` - 7 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (71 total, 27 thin omitted)

### Community 0 - "scripts"
Cohesion: 0.08
Nodes (13): CoreController, CoreService, json(), Body, Controller, Get, Injectable, normalizePhone() (+5 more)

### Community 1 - "tasks"
Cohesion: 0.07
Nodes (27): dependencies, react, react-dom, vite, @vitejs/plugin-react, devDependencies, @types/chrome, @types/react (+19 more)

### Community 2 - "CoreController"
Cohesion: 0.07
Nodes (27): dependencies, argon2, @nestjs/common, @nestjs/core, @nestjs/platform-fastify, @nestjs/swagger, openai, playwright (+19 more)

### Community 3 - "extension/package.json"
Cohesion: 0.11
Nodes (16): AppModule, markStale(), run(), Module, productInput, QuoteInput, quoteItemInput, QuoteState (+8 more)

### Community 4 - "dependencies"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 5 - "service.ts"
Cohesion: 0.07
Nodes (26): devDependencies, @playwright/test, prettier, turbo, typescript, vitest, engines, node (+18 more)

### Community 6 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (25): dependencies, argon2, @prisma/client, devDependencies, prisma, tsx, @types/node, typescript (+17 more)

### Community 7 - "database/package.json"
Cohesion: 0.08
Nodes (23): dependencies, next, react, react-dom, devDependencies, @types/node, @types/react, typescript (+15 more)

### Community 8 - "web/package.json"
Cohesion: 0.09
Nodes (22): compilerOptions, allowJs, incremental, isolatedModules, jsx, lib, module, moduleResolution (+14 more)

### Community 9 - "compilerOptions"
Cohesion: 0.12
Nodes (15): config, ^build, dist/**, .next/**, dependsOn, outputs, cache, persistent (+7 more)

### Community 10 - "worker/package.json"
Cohesion: 0.12
Nodes (16): dependencies, @tgs/database, devDependencies, tsx, typescript, @tgs/database, tsx, typescript (+8 more)

### Community 11 - "api/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, tsx, typescript, tsx, typescript, name, private, scripts (+5 more)

### Community 12 - "extension/manifest.json"
Cohesion: 0.14
Nodes (13): background, service_worker, type, content_scripts, host_permissions, downloads, http://localhost:3001/*, https://web.whatsapp.com/* (+5 more)

### Community 13 - "public/manifest.json"
Cohesion: 0.14
Nodes (13): background, service_worker, type, content_scripts, host_permissions, downloads, http://localhost:3001/*, https://web.whatsapp.com/* (+5 more)

### Community 14 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, jsx, module, moduleResolution, noEmit, types, extends, include (+3 more)

### Community 15 - "ai/package.json"
Cohesion: 0.18
Nodes (10): dependencies, openai, zod, exports, openai, zod, name, private (+2 more)

### Community 16 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, esModuleInterop, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule, skipLibCheck, strict (+1 more)

### Community 17 - "api/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, emitDecoratorMetadata, experimentalDecorators, outDir, extends, include, src, ../../tsconfig.json

### Community 18 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 19 - "config/package.json"
Cohesion: 0.22
Nodes (8): dependencies, zod, exports, zod, name, private, type, version

### Community 20 - "contracts/package.json"
Cohesion: 0.22
Nodes (8): dependencies, zod, exports, zod, name, private, type, version

### Community 21 - "ui/package.json"
Cohesion: 0.22
Nodes (8): exports, react, name, peerDependencies, react, private, type, version

### Community 22 - "worker/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, outDir, extends, include, src, ../../tsconfig.json

### Community 23 - "ai/src/index.ts"
Cohesion: 0.29
Nodes (4): CompatibilityFeedbackService, RequestAnalysisService, ResponseSuggestionService, SemanticSimilarityService

### Community 24 - "database/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, extends, include, src, ../../tsconfig.json

### Community 25 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 26 - "eslint-config/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 27 - "pdf/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 28 - "pricing/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 29 - "testing/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 30 - "validation/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 31 - "content.tsx"
Cohesion: 0.50
Nodes (4): chat(), Panel(), root, selectors

### Community 32 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 33 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 34 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 35 - "typescript-config/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **301 isolated node(s):** `graphify`, `Usage`, `What graphify is for`, `Step 0 - GitHub repos and multi-path merge (only if a URL or several paths)`, `Step 1 - Ensure graphify is installed` (+296 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CoreService` connect `scripts` to `extension/package.json`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `CoreController` connect `scripts` to `extension/package.json`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `dependencies` connect `CoreController` to `api/package.json`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `graphify`, `Usage`, `What graphify is for` to the rest of the system?**
  _301 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.07966101694915254 - nodes in this community are weakly interconnected._
- **Should `tasks` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `CoreController` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._