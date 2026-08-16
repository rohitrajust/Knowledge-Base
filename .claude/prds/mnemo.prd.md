# Mnemo

## Problem
Software engineers working on a project need to understand large amounts of scattered project knowledge — documentation, notes, technical decisions, code-related context — but today that knowledge lives across disconnected tools and documents. Engineers have to manually search through this material to answer questions about how a project works, which is slow and causes knowledge (especially the reasoning behind past decisions) to get lost or re-derived from scratch.

## Evidence
- Assumption — needs validation via user research (interviews with engineers on active projects, or dogfooding on a real team's project knowledge base).

## Users
- **Primary**: Software engineers and other employees on a software project team who need to create, organize, and retrieve project knowledge (notes, documents, decisions) as a shared, growing team resource.
- **Not for**: Non-technical/public knowledge-base users, enterprises needing production-grade auth and admin controls, mobile-first users, or teams needing real-time collaborative editing — not addressed in this phase.

## Hypothesis
We believe **an AI-powered collaborative knowledge base with semantic search, grounded Q&A, notes/documents, and a visual physics-based knowledge graph** will **help software engineering teams understand their projects more easily and avoid manually searching through scattered documentation** for **software engineering teams**.
We'll know we're right when **engineers can ask questions about their project and quickly get accurate, contextual answers drawn from the team's accumulated knowledge, with correct citations**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Answer groundedness (Q&A responses correctly cited to source notes/documents) | TBD — needs validation via evaluation harness | Automated eval set of project questions with known-correct source notes |
| Search/answer relevance (top-k semantic search precision) | TBD — needs validation via evaluation harness | Retrieval eval against a labeled note set |
| Time-to-answer vs. manual search (perceived or measured) | TBD — needs validation via user research | Comparative user testing / self-reported time savings |
| Knowledge base growth & reuse (notes created, links formed, questions asked per active space) | TBD — needs validation via usage analytics once live | In-app usage tracking |

## Scope
**MVP** — A self-hosted, team-based knowledge base (mock signup/login, no production auth) where multiple team members create, edit, and organize notes/documents within a shared project space. The system automatically embeds and indexes this content for natural-language semantic search and grounded AI Q&A with citations, and maintains conversation history/persistent memory across sessions. Users manually create and link notes into an interactive, physics-based knowledge graph (zoom, pan, filter, inspect, navigate); AI may suggest relevant links between notes for the user to review and approve, but does not auto-generate the graph. Security, project isolation, reliability, observability, and evaluation are treated as foundational, not deferred.

**Out of scope**
- Real-time multi-user collaborative editing — adds significant complexity beyond validating the core AI-knowledge hypothesis
- Mobile applications — desktop/web-first for the engineering-team use case
- Public sharing of spaces — MVP is team-internal only
- Third-party integrations (e.g. Slack, GitHub, Jira ingestion) — future expansion once core loop is validated
- Advanced autonomous agents (agents that act on the knowledge base beyond answering questions) — out of scope for this phase
- Fully AI-generated knowledge graphs — graph structure stays user-driven, AI only suggests
- Production-grade authentication and enterprise administration (SSO, RBAC, audit logs) — MVP uses mock signup/login
- Multi-tenant hosted/cloud deployment — MVP is self-hosted

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Foundational platform & project isolation | Teams can create isolated spaces (mock auth) with no cross-space data leakage; baseline observability in place | complete | `.claude/plans/mnemo-m1-foundations.plan.md` |
| 2 | Capture & organize | Team members can create, edit, and organize notes, documents, and references within a shared space | complete | `.claude/plans/mnemo-m2-capture-organize.plan.md` |
| 3 | Manual knowledge graph | Users can link notes and explore an interactive, physics-based graph (zoom, pan, filter, inspect, navigate) | complete | `.claude/plans/mnemo-m3-knowledge-graph.plan.md` |
| 4 | Semantic indexing & search | Notes/documents are automatically embedded and searchable via natural-language semantic search | complete | `.claude/plans/mnemo-m4-semantic-search.plan.md` |
| 5 | Grounded Q&A | Users can ask questions and get AI answers grounded in the team's knowledge base, with citations | complete | `.claude/plans/mnemo-m5-grounded-qa.plan.md` |
| 6 | Conversation & persistent memory | Q&A sessions retain conversation history and persist relevant memory across sessions | complete | `.claude/plans/mnemo-m6-conversation-memory.plan.md` |
| 7 | AI-suggested graph links | AI suggests relevant connections between notes for users to review and approve | complete | `.claude/plans/mnemo-m7-suggested-links.plan.md` |
| 8 | Team collaboration | Multiple team members contribute to and expand a shared space's knowledge base | pending | — |

## Open Questions
- [x] Which embedding model and vector database should Mnemo use? Resolved in milestone 4: local `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim, no API key/cost) + pgvector (provisioned since milestone 1's migration 0002).
- [x] How should persistent memory work across conversations — what gets remembered, how is it surfaced, and how (if ever) is it forgotten? Resolved in milestone 6: the LLM auto-summarizes a conversation into durable facts only when the user explicitly ends it (with an anti-hallucination prompt that can decline to remember anything), summaries are shared at the space level (visible to every team member, not just whoever's conversation produced them), and forgetting is automatic expiry (30-day TTL, filtered out of every read immediately on expiry, physically deleted by an admin cleanup script) plus manual deletion.
- [ ] How will team permissions work once mock auth is replaced by real authentication?
- [ ] What does "project isolation" mean concretely for a self-hosted MVP — isolation between spaces within one deployment, or one deployment per team?
- [ ] How does the system need to scale as a team's knowledge base and graph grow (indexing throughput, graph rendering performance at high node counts)?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Core problem is unvalidated (no user evidence yet) | Medium | High | Run early user interviews / dogfood on a real team project before investing beyond MVP |
| Mock auth in MVP could mask project-isolation or permission bugs that surface later | Medium | High | Design the project-isolation boundary correctly now, even though auth itself is mocked |
| AI Q&A could hallucinate or mis-cite sources, eroding trust in "grounded answers" | Medium | High | Build a groundedness evaluation harness before the Q&A milestone ships broadly |
| Embedding/vector store choice made too early could force costly rework | Medium | Medium | Defer the concrete choice to the architecture phase (`/plan`), evaluate against MVP-scale data |
| Physics-based graph may not perform well as node/edge count grows | Medium | Medium | Define a target node-count for MVP and load-test the graph rendering early |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
