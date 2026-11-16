# Software Design Principles

A working reference — principles I apply when starting or reviewing a system design,
with sources where the principle has a canonical articulation.

---

## 1. Start with the data, not the UI

> "Bad programmers worry about the code. Good programmers worry about data structures and their relationships."
> — Linus Torvalds (2006, Git mailing list)

> "Data dominates. If you've chosen the right data structures and organised things well,
> the algorithms will almost always be self-evident."
> — Rob Pike, *Notes on Programming in C* (1989)

The schema is the hardest thing to change later. A wrong data model compounds into every
query, every API, every component above it. Get the structure right before touching the UI.
Domain-Driven Design formalises this: the model is the design. (Eric Evans, *Domain-Driven Design*, 2003)

---

## 2. Name things after what they are, not what they do

> "There are only two hard things in Computer Science: cache invalidation and naming things."
> — Phil Karlton (widely attributed, ~1996)

Names should collapse the concept, not describe the machinery. `OrderPlaced` not
`OrderStatusChangeEventHandler`. DDD calls this the *ubiquitous language*: names used in code
should match names used in conversation with domain experts, and vice versa.
(Evans, *DDD*, ch. 2)

---

## 3. Prefer boring technology

> "The problem with not following this advice is that it's a one-way door…
> Mindful of this, you should add new technology only when the alternative is significantly worse."
> — Dan McKinley, *Choose Boring Technology* (2015, mcfunley.com/choose-boring-technology)

Every novel technology choice is a bet on your team's ability to debug it at 2am.
Postgres over a graph database. Server-rendered HTML over a client SPA where the page is mostly static.
The interesting part of a system should be the domain, not the infrastructure.

---

## 4. One obvious way to do each thing

> "There should be one — and preferably only one — obvious way to do it."
> — Tim Peters, *The Zen of Python* (PEP 20, 2004)

If there are two paths to the same outcome, both will be used, data will diverge, and bugs
will be invisible until they compound. Design so that the correct path is the only natural path.
(Related: the "pit of success" — Rico Mariani / Brad Abrams, Microsoft, ~2003)

---

## 5. Read before you write

Don't design the API before you understand the query patterns.
Don't design the component before you understand what the server can efficiently produce.

Martin Fowler's *Patterns of Enterprise Application Architecture* (2002) organises around this:
the right repository and query pattern depends entirely on the read/write ratio and
the shape of data consumers need. ORM or raw SQL, batch or streaming — all flow from
understanding the reads first.

---

## 6. Push decisions down, not up

> "Smart endpoints, dumb pipes."
> — Sam Newman, *Building Microservices* (O'Reilly, 2015)

> "Make illegal states unrepresentable."
> — Yaron Minsky, Jane Street (keynote, CUFP 2011)

Business logic belongs in the database or server layer — not scattered across client components
where it can be bypassed or duplicated. SQL constraints, foreign keys, and server-side validation
enforce rules structurally. Client-side checks are UX, not correctness.

---

## 7. Make the wrong thing hard to do

> "Poka-yoke (ポカよけ): mistake-proofing — a mechanism that either prevents a mistake from
> occurring or makes the mistake obvious at a glance."
> — Shigeo Shingo, *Zero Quality Control* (Productivity Press, 1986)

Applied to software: foreign keys rather than application-level integrity checks.
TypeScript types on API boundaries rather than runtime hope.
Distinct types for raw and validated input rather than a single `string` everywhere.
The system should resist misuse structurally, not just by convention.

---

## 8. Defer until it hurts

> "YAGNI — You Aren't Gonna Need It."
> — Ron Jeffries, Kent Beck; *Extreme Programming Explained* (Addison-Wesley, 1999)

> "Premature optimisation is the root of all evil."
> — Donald Knuth, *Computer Programming as an Art* (ACM, 1974)

Don't add rate limiting until you need it. Don't abstract until the third repetition
(the Rule of Three — Martin Fowler, *Refactoring*, 1999). Premature structure is future debt
in a nicer font.

---

## 9. The seam is the API boundary

> "A seam is a place where you can alter behaviour in your program without editing in that place."
> — Michael Feathers, *Working Effectively with Legacy Code* (Prentice Hall, 2004)

Whatever crosses a process or network boundary must be explicit, versioned, and minimal.
Keep internal complexity internal. Corollary — Hyrum's Law:

> "With a sufficient number of users of an API, it does not matter what you promise in the contract:
> all observable behaviours of your system will be depended on by somebody."
> — Hyrum Wright (hyrumslaw.com)

Keep the surface small so you control what's observable.

---

## On atomic knowledge representation

The design principles above apply equally to how knowledge is structured in flashcard systems.

> "The minimum information principle: the simpler the material, the easier it is to remember."
> — Piotr Woźniak, *20 Rules of Formulating Knowledge* (SuperMemo, 1999 — supermemo.com/en/blog/twenty-rules-of-formulating-knowledge)

> "It's worth putting serious time into writing good questions… The goal is to represent knowledge
> as a network of simple atomic facts."
> — Michael Nielsen, *Augmenting Long-term Memory* (2018 — augmentingcognition.com/ltm.html)

A card should encode exactly one retrievable fact: one stimulus → one response.
Long answers are a sign the question is doing too much work.
This is structurally identical to the single-responsibility principle in code.

---

*Created: 2026-03-24*
