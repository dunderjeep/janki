/**
 * seed-dev-decks.ts
 *
 * Creates 20 senior developer interview prep decks — dev1 through dev20.
 * Skips any deck that already exists by name.
 *
 * Usage: npx tsx scripts/seed-dev-decks.ts your@email.com
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import * as schema from '../src/db/schema/janki'
import * as authSchema from '../src/db/schema/auth'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema: { ...schema, ...authSchema } })

type Card = [string, string]
interface Deck { name: string; description: string; cards: Card[] }

function newSrs(): schema.SrsObject {
  return { state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0, dueAt: new Date().toISOString(), lastReviewedAt: null }
}

const DECKS: Deck[] = [

  // ── dev1 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev1. 🧠 System Design',
    description: 'Scalability, distributed systems, and architecture trade-offs',
    cards: [
      ['CAP theorem letters?', 'Consistency, Availability, Partition tolerance'],
      ['Can CAP give all 3?', 'No — pick 2 during a partition'],
      ['Horizontal vs vertical scaling?', 'Horizontal: more machines; vertical: bigger machine'],
      ['What is a CDN?', 'Caches static content on servers near users'],
      ['What does a load balancer do?', 'Distributes incoming requests across servers'],
      ['Round-robin load balancing?', 'Cycles requests to each server in turn'],
      ['What is a message queue?', 'Async buffer between producer and consumer'],
      ['What is database sharding?', 'Splits rows across multiple DB servers by key'],
      ['What is database replication?', 'Copies data to multiple servers for redundancy'],
      ['Leader-follower: writes go where?', 'Leader only'],
      ['What is eventual consistency?', 'All nodes converge given no new writes'],
      ['What is a cache hit?', 'Data found in cache — no DB query needed'],
      ['What is cache invalidation?', 'Removing or updating stale data in cache'],
      ['What is a reverse proxy?', 'Forwards client requests to backend servers'],
      ['What is rate limiting?', 'Restricts request frequency per client/IP'],
      ['What is a circuit breaker?', 'Stops calls to a failing service temporarily'],
      ['What is idempotency?', 'Same request repeated produces same result'],
      ['ACID acronym?', 'Atomicity, Consistency, Isolation, Durability'],
      ['What is a hot shard?', 'Uneven load concentrated on one shard'],
      ['What is consistent hashing?', 'Minimizes key remapping when nodes change'],
      ['What is a write-ahead log?', 'Changes logged before applied to DB'],
      ['Thundering herd problem?', 'Many requests hit origin on cache expiry simultaneously'],
      ['SQL vs NoSQL trade-off?', 'SQL: strong schema; NoSQL: flexible scale'],
      ['What is fanout?', 'One event triggers many downstream actions'],
      ['What is backpressure?', 'Slow consumer signals fast producer to slow down'],
      ['What is an SLA?', 'Agreement on service availability percentage'],
      ['What is two-phase commit?', 'Distributed atomic commit protocol'],
      ['What is CQRS?', 'Separate read model and write model'],
      ['What is event sourcing?', 'Store events as source of truth, derive state'],
      ['What is a saga pattern?', 'Distributed transaction via compensating actions'],
    ],
  },

  // ── dev2 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev2. ⚡ JavaScript Runtime',
    description: 'Event loop, closures, async patterns, and JS engine internals',
    cards: [
      ['What is the call stack?', 'LIFO stack tracking current function calls'],
      ['What is the event loop?', 'Runs queued tasks when call stack is empty'],
      ['What is a microtask?', 'Runs after current task before next task'],
      ['Microtask examples?', 'Promise callbacks, queueMicrotask, MutationObserver'],
      ['What is a macrotask?', 'setTimeout, setInterval, I/O callbacks'],
      ['What is a closure?', 'Function retaining access to its outer scope'],
      ['var hoisting behavior?', 'Function-scoped, initialized as undefined'],
      ['let/const hoisting behavior?', 'Block-scoped, temporal dead zone until declared'],
      ['What is the temporal dead zone?', 'Period before let/const line — access throws ReferenceError'],
      ['What is prototypal inheritance?', 'Objects inherit directly from other objects'],
      ['typeof null returns?', '"object" — historical JS bug'],
      ['this in arrow function?', 'Lexically bound from enclosing scope'],
      ['What is event delegation?', 'One listener on parent handles all child events'],
      ['What is debouncing?', 'Delays execution until input pauses'],
      ['What is throttling?', 'Executes at most once per time interval'],
      ['Promise.all behavior?', 'Resolves when all resolve, rejects on first reject'],
      ['Promise.race behavior?', 'Settles when first promise settles'],
      ['Promise.allSettled behavior?', 'Resolves with all outcomes, never rejects'],
      ['What is a generator function?', 'Yields values lazily, pausable with yield'],
      ['What is WeakMap?', 'Object-keyed map, keys garbage-collectable'],
      ['What is structuredClone?', 'Deep clones without JSON serialization quirks'],
      ['Optional chaining ?. does?', 'Returns undefined instead of throwing on null'],
      ['Nullish coalescing ?? does?', 'Falls back only on null or undefined'],
      ['async/await is sugar for?', 'Promises with synchronous-looking syntax'],
      ['ESM vs CJS key difference?', 'ESM: static imports; CJS: require() runtime'],
      ['What causes JS memory leaks?', 'Lingering refs: timers, closures, detached DOM'],
      ['What is a Symbol?', 'Unique non-stringifiable primitive key'],
    ],
  },

  // ── dev3 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev3. 📝 TypeScript',
    description: 'Types, generics, utility types, and type system mechanics',
    cards: [
      ['type vs interface key difference?', 'Interface is declaration-mergeable; type alias is not'],
      ['What is a generic?', 'Type parameterized by another type T'],
      ['What is Partial<T>?', 'All fields of T become optional'],
      ['What is Required<T>?', 'All optional fields of T become required'],
      ['What is Pick<T, K>?', 'Creates type with only keys K from T'],
      ['What is Omit<T, K>?', 'Creates type excluding keys K from T'],
      ['What is Record<K, V>?', 'Object type: keys K, values V'],
      ['What is a discriminated union?', 'Union narrowed by a shared literal field'],
      ['What is type narrowing?', 'Shrinking a union type via runtime check'],
      ['What does as const do?', 'Infers narrowest literal types, marks readonly'],
      ['What is keyof T?', 'Union type of all property names of T'],
      ['What does infer do?', 'Extracts a type from inside a conditional type'],
      ['unknown vs any difference?', 'unknown requires narrowing before use; any does not'],
      ['What is never?', 'Type with no values — unreachable code or empty union'],
      ['What is a type guard?', 'Function narrowing type via return type x is T'],
      ['What does strict mode enable?', 'strictNullChecks, noImplicitAny, and more'],
      ['What is a mapped type?', 'Transforms each property of a type systematically'],
      ['What is a conditional type?', 'T extends U ? X : Y — type-level if/else'],
      ['What is ReturnType<T>?', 'Infers the return type of function type T'],
      ['What is Parameters<T>?', 'Infers parameter tuple of function type T'],
      ['What is Awaited<T>?', 'Recursively unwraps nested Promise type'],
      ['What is declaration merging?', 'Two interfaces with same name auto-combine'],
      ['What is the satisfies operator?', 'Validates type constraint without widening'],
      ['What is a template literal type?', 'Type built from string literal interpolation'],
      ['What is Extract<T, U>?', 'Union members of T assignable to U'],
    ],
  },

  // ── dev4 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev4. ⚛️ React Patterns',
    description: 'Hooks, rendering, performance, and component architecture',
    cards: [
      ['Rules of hooks?', 'Top level only; React functions only'],
      ['What does useCallback do?', 'Memoizes function reference across renders'],
      ['What does useMemo do?', 'Memoizes computed value across renders'],
      ['When does memo() not help?', 'When props still change or context updates'],
      ['What is the React reconciler?', 'Algorithm diffing virtual DOM to compute updates'],
      ['What triggers a re-render?', 'State, prop, or context change'],
      ['What is prop drilling?', 'Passing props through many intermediate components'],
      ['What is useReducer?', 'useState alternative for complex state logic'],
      ['What is useRef?', 'Mutable ref that persists without triggering re-render'],
      ['Controlled vs uncontrolled input?', 'Controlled: React state; uncontrolled: DOM ref'],
      ['What is key reconciliation?', 'Unique key tells React which list item is which'],
      ['What is Suspense?', 'Boundary that shows fallback while children load'],
      ['What is React.lazy?', 'Code-splits component, loads on first render'],
      ['What is an error boundary?', 'Class component catching render errors in subtree'],
      ['What is a portal?', 'Renders child outside parent DOM node'],
      ['What is useTransition?', 'Marks state update as non-urgent, keeps UI responsive'],
      ['What is useDeferredValue?', 'Returns stale value while new value computes'],
      ['What is StrictMode double-invoke?', 'Runs render twice to surface side effect bugs'],
      ['What is compound component pattern?', 'Parent and child share state implicitly via context'],
      ['What is render prop pattern?', 'Shares behavior by passing a function as prop'],
      ['What causes stale closure in useEffect?', 'Effect captures old state value at creation time'],
      ['What is batch updating?', 'Multiple setState calls merged into one re-render'],
      ['What is hydration?', 'Attaches React event handlers to server-rendered HTML'],
      ['What is flushSync?', 'Forces synchronous React state update'],
      ['What is useImperativeHandle?', 'Customizes the ref object exposed to parent'],
      ['What is automatic batching in React 18?', 'Batches state updates in async code too'],
    ],
  },

  // ── dev5 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev5. 🔼 Next.js App Router',
    description: 'RSC, caching, server actions, routing, and rendering strategies',
    cards: [
      ['What is a React Server Component?', 'Renders on server, zero client JavaScript'],
      ['RSC vs Client Component?', 'RSC: no hooks or events; Client: interactive'],
      ['What does \'use client\' do?', 'Marks component tree boundary as client-side'],
      ['What does \'use server\' do?', 'Marks async function as server action'],
      ['What is a server action?', 'Async function called from client, executes on server'],
      ['What is generateStaticParams?', 'Pre-generates dynamic route params at build time'],
      ['What is revalidatePath?', 'Purges Next.js cache for a specific path'],
      ['What is revalidateTag?', 'Purges cache entries sharing a specific tag'],
      ['Next.js caching layers?', 'Request memo, data cache, full-route cache, router cache'],
      ['fetch cache: force-cache?', 'Always serve cached response'],
      ['fetch cache: no-store?', 'Never cache — always fresh from server'],
      ['fetch revalidate: N?', 'Stale-while-revalidate after N seconds'],
      ['What does loading.tsx do?', 'Shows Suspense fallback for route segment'],
      ['What does error.tsx do?', 'Client error boundary for route segment'],
      ['What is a route group?', '(folder) — groups routes without adding URL segment'],
      ['What is a parallel route?', '@slot — renders multiple pages in one layout'],
      ['What is an intercepting route?', 'Shows route as modal while URL context preserved'],
      ['What is next/image benefit?', 'Lazy load, resize, WebP conversion, no layout shift'],
      ['What is next/font benefit?', 'Zero layout shift, self-hosted, optimized loading'],
      ['What does middleware.ts do?', 'Runs on edge before every matching request'],
      ['What is ISR?', 'Stale-while-revalidate for static pages'],
      ['What is PPR?', 'Static shell streamed with dynamic holes filled in'],
      ['What is unstable_cache?', 'Caches any async function result with tags/revalidation'],
    ],
  },

  // ── dev6 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev6. 🌐 REST & HTTP',
    description: 'HTTP methods, status codes, headers, REST principles, and API design',
    cards: [
      ['What does idempotent mean in HTTP?', 'Repeating request leaves server in same state'],
      ['Which HTTP methods are idempotent?', 'GET, PUT, DELETE, HEAD, OPTIONS'],
      ['What is HTTP/2 multiplexing?', 'Multiple streams over single TCP connection'],
      ['What is CORS?', 'Browser policy restricting cross-origin API requests'],
      ['What is a preflight request?', 'OPTIONS sent before unsafe cross-origin request'],
      ['HTTP 200 vs 201?', '200: OK; 201: Created (resource created)'],
      ['HTTP 204 means?', 'No Content — success with empty response body'],
      ['HTTP 401 vs 403?', '401: not authenticated; 403: authenticated but unauthorized'],
      ['HTTP 422 means?', 'Unprocessable Entity — validation failed'],
      ['HTTP 429 means?', 'Too Many Requests — rate limited'],
      ['HTTP 503 means?', 'Service Unavailable — server overloaded or down'],
      ['What is HATEOAS?', 'REST responses include links to available next actions'],
      ['What is content negotiation?', 'Client specifies format via Accept header'],
      ['What is ETag?', 'Hash of resource version for cache validation'],
      ['Cache-Control: no-cache vs no-store?', 'no-cache: revalidate; no-store: never cache'],
      ['What is a webhook?', 'Server pushes events to a registered callback URL'],
      ['PUT vs PATCH difference?', 'PUT replaces entire resource; PATCH partial update'],
      ['What is an idempotency key?', 'Client-supplied ID to deduplicate retried requests'],
      ['What is HTTP long polling?', 'Client holds open request until server has data'],
      ['What are Server-Sent Events?', 'Server pushes event stream over single HTTP connection'],
      ['What is gzip in HTTP?', 'Content-Encoding: gzip compresses response body'],
      ['What is REST versioning via URI?', 'Version in path: /v1/users'],
      ['What is connection pooling?', 'Reuses TCP or DB connections across requests'],
      ['What is backoff and retry?', 'Exponential delay between retried failed requests'],
    ],
  },

  // ── dev7 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev7. 🔐 Auth & Security',
    description: 'OAuth2, JWT, PKCE, XSS, CSRF, and security best practices',
    cards: [
      ['What is OAuth2?', 'Delegated authorization framework — grants limited access'],
      ['What is an access token?', 'Short-lived credential for API resource access'],
      ['What is a refresh token?', 'Long-lived token to obtain new access tokens'],
      ['What is PKCE?', 'Proof Key for Code Exchange — secures public client flows'],
      ['What is the Authorization Code flow?', 'Server exchanges code for tokens after user login'],
      ['Why is Implicit flow deprecated?', 'Tokens exposed in URL fragment — insecure'],
      ['What is a JWT?', 'Signed JSON payload: header.claims.signature base64url'],
      ['Where to store JWT on client?', 'HttpOnly cookie — not localStorage (XSS risk)'],
      ['What validates a JWT?', 'Verify signature using secret or public key'],
      ['What is XSS?', 'Injecting malicious scripts via user input'],
      ['What is CSRF?', 'Forging authenticated cross-site request as victim'],
      ['How to prevent CSRF?', 'SameSite cookie attribute plus CSRF token'],
      ['What is SQL injection?', 'Malicious SQL injected via unsanitized input'],
      ['How to prevent SQL injection?', 'Parameterized queries and ORMs — never concatenate'],
      ['What is Content Security Policy?', 'Header restricting allowed script and resource sources'],
      ['What is HSTS?', 'Header forcing HTTPS, remembered by browser'],
      ['What is password hashing best practice?', 'bcrypt or argon2 — never MD5 or SHA1 alone'],
      ['What is the sub JWT claim?', "Subject — identifier of the token's user"],
      ['What is the exp JWT claim?', 'Expiry — Unix timestamp after which token invalid'],
      ['What is OIDC?', 'Identity layer on OAuth2 adding id_token with user info'],
      ['What is the PKCE code verifier?', 'Random string; code_challenge = SHA256(verifier)'],
      ['What is rate limiting for auth?', 'Limit login attempts to prevent brute force'],
      ['What is a timing attack?', 'Exploits response time difference to infer secrets'],
      ['What is defense in depth?', 'Multiple security layers so no single point of failure'],
    ],
  },

  // ── dev8 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev8. 🐘 PostgreSQL',
    description: 'Indexes, query planning, transactions, and advanced SQL',
    cards: [
      ['What is a B-tree index?', 'Default index — ordered, fast equality and range queries'],
      ['What is a GIN index?', 'Inverted index — best for arrays, JSONB, full-text'],
      ['What is a GiST index?', 'Best for geometric, PostGIS, and range types'],
      ['What does EXPLAIN ANALYZE do?', 'Executes query and shows actual execution plan'],
      ['What is a sequential scan?', 'Reading every table row — no index used'],
      ['What is MVCC?', 'Old row versions kept so reads don\'t block writes'],
      ['What is VACUUM?', 'Reclaims disk space from dead row versions'],
      ['What is a deadlock?', 'Two transactions each waiting for the other\'s lock'],
      ['What is an index scan?', 'Traverses index to find matching rows directly'],
      ['What is a bitmap scan?', 'OR-combines multiple indexes into bitmap then fetches'],
      ['What is a covering index?', 'Index includes all columns needed — no table fetch'],
      ['What is a CTE?', 'Common Table Expression — named subquery via WITH'],
      ['What is a window function?', 'Aggregate computed over rows without collapsing them'],
      ['What is COALESCE?', 'Returns first non-null argument in list'],
      ['ON CONFLICT DO UPDATE?', 'Upsert — update row when unique constraint violated'],
      ['What is PgBouncer?', 'Connection pooler — multiplexes many clients to fewer DB connections'],
      ['What is a partial index?', 'Index with WHERE clause — smaller, faster for subset'],
      ['JSONB vs JSON difference?', 'JSONB: binary, indexable; JSON: text, preserves order'],
      ['What is row-level security?', 'Policies restrict which rows a user can see or modify'],
      ['What is a materialized view?', 'Stored query result refreshed on demand'],
      ['What is LATERAL in SQL?', 'Subquery referencing columns from preceding FROM item'],
      ['What is pg_stat_statements?', 'Extension tracking slowest and most frequent queries'],
      ['What is a transaction savepoint?', 'Partial rollback point within a transaction'],
      ['What is LISTEN/NOTIFY?', 'Postgres pub/sub for real-time app notifications'],
      ['What is an advisory lock?', 'Application-level lock not tied to a table row'],
    ],
  },

  // ── dev9 ──────────────────────────────────────────────────────────────────
  {
    name: 'dev9. ⚡ Redis',
    description: 'Data structures, eviction, caching patterns, pub/sub, and clustering',
    cards: [
      ['Best Redis structure for queues?', 'List — LPUSH to add, RPOP to consume'],
      ['Best Redis structure for rankings?', 'Sorted Set — members scored and ordered'],
      ['Best structure for field-value pairs?', 'Hash — like a mini key-value store per key'],
      ['Best structure for unique membership?', 'Set — union, intersection, difference operations'],
      ['What is TTL in Redis?', 'Time To Live — key auto-deleted after N seconds'],
      ['What is PERSIST command?', 'Removes TTL — key lives forever'],
      ['allkeys-lru eviction policy?', 'Evicts least recently used key regardless of TTL'],
      ['volatile-lru eviction policy?', 'Evicts LRU key only among keys with TTL set'],
      ['noeviction policy?', 'Returns error when memory full — never evicts'],
      ['What is cache-aside pattern?', 'App reads cache; on miss, reads DB and fills cache'],
      ['What is write-through caching?', 'Write to cache and DB atomically on every write'],
      ['What is the dog-pile effect?', 'Many requests hit DB simultaneously on cache expiry'],
      ['How to prevent dog-pile?', 'Distributed lock or probabilistic early expiry'],
      ['What is Redis pipeline?', 'Batch multiple commands in one TCP round trip'],
      ['What is Redis MULTI/EXEC?', 'Atomic transaction block — all or nothing'],
      ['What is Lua scripting in Redis?', 'Custom atomic scripts executed server-side'],
      ['What is Redis Cluster?', 'Auto-shards keyspace across multiple nodes'],
      ['What is Redis Sentinel?', 'Monitors master, promotes replica on failure'],
      ['SCAN vs KEYS difference?', 'SCAN: non-blocking cursor; KEYS: blocks server'],
      ['What is Redis Streams?', 'Persistent append-only log with consumer groups'],
      ['What is SETNX?', 'Set if not exists — used for distributed locking'],
      ['What is HyperLogLog?', 'Probabilistic cardinality estimator — approximate DISTINCT'],
      ['What is pub/sub in Redis?', 'Publisher pushes to channel; subscribers receive instantly'],
      ['What is keyspace notification?', 'Notifies clients when key events occur (expire, set)'],
    ],
  },

  // ── dev10 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev10. 🔗 GraphQL',
    description: 'Schema, resolvers, N+1, DataLoader, subscriptions, and federation',
    cards: [
      ['What is a GraphQL schema?', 'SDL type definitions describing all queries and mutations'],
      ['What is a resolver?', 'Function returning data for a specific field'],
      ['What is the N+1 problem?', 'Each parent row triggers a separate child query'],
      ['What is DataLoader?', 'Batches and deduplicates resolver fetches per request'],
      ['GraphQL query vs mutation?', 'Query: read-only; mutation: write operation'],
      ['What is a subscription?', 'Real-time event stream pushed over WebSocket'],
      ['What is a fragment?', 'Named reusable field selection set'],
      ['What is an inline fragment?', 'Type-specific fields using ... on TypeName'],
      ['What is schema introspection?', 'Querying the schema itself for its type definitions'],
      ['What is __typename?', 'Meta field returning the GraphQL type name of an object'],
      ['What is a union type?', 'Field returning one of several unrelated object types'],
      ['What is an interface type?', 'Shared fields implemented by multiple types'],
      ['What is schema federation?', "Apollo's distributed schema composition across services"],
      ['What is persisted queries?', 'Query hash replaces full query string in requests'],
      ['What is over-fetching?', 'REST returns more fields than client needs'],
      ['What is under-fetching?', 'REST requires multiple trips for related data'],
      ['What is context in resolvers?', 'Shared object per request: auth, DB, DataLoaders'],
      ['What is a custom scalar?', 'Non-standard type: Date, URL, JSON with custom serialize/parse'],
      ['What is a directive?', '@include, @skip — conditional field fetching'],
      ['What is schema-first vs code-first?', 'Schema-first: SDL then resolvers; code-first: types generate SDL'],
      ['What is a query depth limit?', 'Prevents deeply nested queries from hammering server'],
    ],
  },

  // ── dev11 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev11. 🐳 Docker',
    description: 'Images, layers, networking, volumes, and Compose best practices',
    cards: [
      ['What is a Docker image layer?', 'Read-only filesystem diff created by one instruction'],
      ['What makes layers cache?', 'Unchanged instruction reuses previous layer from cache'],
      ['What is a multi-stage build?', 'Multiple FROM stages — only final artifacts copied'],
      ['Why use multi-stage builds?', 'Smaller final image — no dev dependencies included'],
      ['COPY vs ADD difference?', 'COPY: local files; ADD: also extracts archives and URLs'],
      ['CMD vs ENTRYPOINT?', 'ENTRYPOINT: fixed binary; CMD: default args to it'],
      ['Docker bridge networking?', 'Default isolated network per Compose project'],
      ['Docker host networking?', 'Container shares host machine network stack directly'],
      ['What is a named volume?', 'Docker-managed persistent storage surviving container restart'],
      ['What is a bind mount?', 'Host filesystem path mounted into container'],
      ['What does EXPOSE instruction do?', 'Documents port — does NOT publish it to host'],
      ['-p 3000:3000 flag?', 'Maps host port 3000 to container port 3000'],
      ['What does docker exec do?', 'Runs a command inside a running container'],
      ['What is .dockerignore?', 'Excludes files from build context — like .gitignore'],
      ['What is docker system prune?', 'Removes unused images, containers, volumes, networks'],
      ['What is BuildKit?', 'Next-gen Docker build engine: parallel, cache mounts'],
      ['What is a distroless image?', 'Minimal image with no shell or package manager'],
      ['What is a health check?', 'Command Docker runs to test if container is healthy'],
      ['Image tagging best practice?', 'Use semantic versions — avoid mutable latest tag'],
      ['What is docker compose watch?', 'Auto-rebuilds and syncs on file changes in dev'],
      ['What is a multi-platform build?', 'Builds image for multiple CPU architectures (amd64, arm64)'],
      ['What is docker buildx?', 'Extended build with BuildKit, multi-platform support'],
      ['What is layer squashing?', 'Flattens all layers into one — smaller but uncacheable'],
    ],
  },

  // ── dev12 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev12. ☸️ Kubernetes',
    description: 'Pods, workloads, services, ingress, autoscaling, and operations',
    cards: [
      ['What is a Pod?', 'Smallest deployable unit — one or more containers sharing network'],
      ['What is a Deployment?', 'Manages desired replica count and rolling update strategy'],
      ['What is a ReplicaSet?', 'Ensures N pod replicas are running at all times'],
      ['ClusterIP service type?', 'Service reachable only within the cluster'],
      ['NodePort service type?', 'Service exposed on each node\'s static port'],
      ['LoadBalancer service type?', 'Cloud provider creates external load balancer'],
      ['What is an Ingress?', 'HTTP routing rules: host and path to backend services'],
      ['What is a Namespace?', 'Virtual cluster partition — isolates resources'],
      ['What is a ConfigMap?', 'Non-sensitive config key-values injected into pods'],
      ['What is a Secret?', 'Base64-encoded sensitive config injected into pods'],
      ['What is a PVC?', "PersistentVolumeClaim — pod's request for storage"],
      ['What is HPA?', 'Horizontal Pod Autoscaler — scales replicas by CPU/custom metrics'],
      ['kubectl get pods does?', 'Lists all pods in current namespace'],
      ['kubectl describe pod does?', 'Shows events, status, conditions for a pod'],
      ['kubectl exec -it does?', 'Opens interactive shell in a running pod container'],
      ['What is a liveness probe?', 'Kills and restarts container if check fails'],
      ['What is a readiness probe?', 'Removes pod from service endpoint until check passes'],
      ['What is a DaemonSet?', 'Runs exactly one pod per node (logging, monitoring)'],
      ['What is a StatefulSet?', 'Ordered pods with stable network identity for stateful apps'],
      ['What is a rolling update?', 'Replaces pods gradually — zero downtime deploy'],
      ['kubectl rollout undo does?', 'Rolls back Deployment to previous revision'],
      ['What is a taint?', 'Node property that repels pods unless they tolerate it'],
      ['What is node affinity?', 'Schedules pods on nodes matching label criteria'],
      ['What is kubectl top pods?', 'Shows live CPU and memory usage per pod'],
      ['What is a CronJob?', 'Runs a Job on a Kubernetes cron schedule'],
      ['What is Helm?', 'Package manager for Kubernetes — templated charts'],
    ],
  },

  // ── dev13 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev13. ☁️ AWS Essentials',
    description: 'Core AWS services: compute, storage, networking, IAM, and databases',
    cards: [
      ['What is an IAM role?', 'Temporary credentials for services or users to assume'],
      ['What is an IAM policy?', 'JSON document granting or denying specific permissions'],
      ['What is assume-role?', "Temporarily take on another role's permissions"],
      ['What is S3?', 'Object storage — unlimited files organized in buckets'],
      ['What is S3 versioning?', 'Keeps all versions of an object in a bucket'],
      ['What is a presigned S3 URL?', 'Time-limited URL granting access without credentials'],
      ['What is CloudFront?', 'CDN distributing content from global edge locations'],
      ['What is RDS?', 'Managed relational database — Postgres, MySQL, etc.'],
      ['What is Aurora?', 'AWS-native Postgres/MySQL with auto-scaling storage'],
      ['What is Lambda?', 'Event-driven serverless function — pay per invocation'],
      ['What is Lambda cold start?', 'Latency on first invocation while environment initializes'],
      ['What is API Gateway?', 'Managed HTTP/WebSocket API fronting Lambda or services'],
      ['What is a VPC?', 'Virtual private network isolated within AWS'],
      ['Public vs private subnet?', 'Public: has internet gateway route; private: does not'],
      ['What is a security group?', 'Stateful instance-level firewall rules'],
      ['What is a NACL?', 'Stateless subnet-level firewall rules'],
      ['What is ECS?', 'Managed Docker container orchestration service'],
      ['What is EKS?', 'Managed Kubernetes service on AWS'],
      ['What is ECR?', 'Elastic Container Registry — hosts Docker images'],
      ['What is SQS?', 'Managed message queue — at-least-once delivery'],
      ['What is SNS?', 'Pub/sub notification service — fan-out to subscribers'],
      ['What is CloudWatch?', 'AWS monitoring: logs, metrics, alarms, dashboards'],
      ['What is a NAT Gateway?', 'Lets private subnet reach internet outbound only'],
      ['What is the shared responsibility model?', 'AWS owns infra; customer owns data and config'],
      ['What is Route 53?', 'AWS DNS service and domain registration'],
    ],
  },

  // ── dev14 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev14. 🏗️ Terraform & IaC',
    description: 'State management, modules, plan/apply workflow, and AWS provisioning',
    cards: [
      ['What is Terraform state?', 'Tracks real-world resources mapped to config'],
      ['Default state storage?', 'Local terraform.tfstate file'],
      ['What is a remote state backend?', 'S3/GCS stores state for team sharing and locking'],
      ['What is state locking?', 'Prevents concurrent applies corrupting state'],
      ['terraform init does?', 'Downloads providers and initializes backend'],
      ['terraform plan does?', 'Shows changes that would be applied — dry run'],
      ['terraform apply does?', 'Creates, updates, or destroys resources to match config'],
      ['terraform destroy does?', 'Destroys all resources managed by configuration'],
      ['What is a Terraform module?', 'Reusable configuration in a subdirectory with inputs/outputs'],
      ['What is a data source?', 'Reads existing resource not managed by Terraform'],
      ['What is a provider?', 'Plugin that manages a specific API (AWS, GCP, Kubernetes)'],
      ['What is terraform.tfvars?', 'File supplying variable values for a configuration'],
      ['What is a workspace?', 'Separate state for same config — staging vs prod'],
      ['What does terraform import do?', 'Brings existing resource under Terraform management'],
      ['What is drift?', 'Real resource diverged from Terraform state'],
      ['What is count in Terraform?', 'Creates N copies of a resource'],
      ['What is for_each?', 'Creates one resource instance per map or set item'],
      ['What is depends_on?', "Explicit dependency when Terraform can't infer it"],
      ['What is a Terraform output?', 'Exports a value after apply for use by other modules'],
      ['What is locals?', 'Named computed values within a module — no input/output'],
      ['What is .terraform.lock.hcl?', 'Locks provider version hashes for reproducibility'],
      ['What is terragrunt?', 'Thin wrapper adding DRY and remote state config to Terraform'],
      ['What is terraform fmt?', 'Formats .tf files to canonical style'],
    ],
  },

  // ── dev15 ─────────────────────────────────────────────────────────────���───
  {
    name: 'dev15. 🧪 Testing',
    description: 'Unit, integration, E2E, mocking, React Testing Library, and TDD',
    cards: [
      ['What is a unit test?', 'Tests one function or module in isolation'],
      ['What is an integration test?', 'Tests interaction between multiple real components'],
      ['What is an E2E test?', 'Tests full user flow through a real browser'],
      ['What is a mock?', 'Pre-programmed with expected calls and return values'],
      ['What is a stub?', 'Returns fixed values without verifying calls'],
      ['What is a spy?', 'Wraps real function and records how it was called'],
      ['What is jest.fn()?', 'Creates a mock function with call tracking'],
      ['What is vi.mock() in Vitest?', 'Auto-mocks a module, replacing exports with mock fns'],
      ['RTL getByRole does?', 'Queries element by its accessible ARIA role'],
      ['RTL getByText does?', 'Queries element by its visible text content'],
      ['userEvent vs fireEvent?', 'userEvent simulates real browser interactions; fireEvent is lower-level'],
      ['What is waitFor?', 'Polls assertion until it passes or times out'],
      ['What is Playwright?', 'Browser automation framework for E2E testing'],
      ['What is a locator in Playwright?', 'Lazy selector for a DOM element — auto-waits'],
      ['What does code coverage measure?', 'Percentage of code lines executed by tests'],
      ['100% coverage guarantees?', 'Nothing — misses logical edge cases and combinations'],
      ['What is TDD?', 'Write failing test first, then write code to pass it'],
      ['What is a snapshot test?', 'Serializes output, fails on any diff from saved snapshot'],
      ['What is beforeEach?', 'Runs setup code before every test in a block'],
      ['What is test isolation?', 'Tests share no state and run in any order'],
      ['What is a test fixture?', 'Reusable test setup data or state'],
      ['What is contract testing?', 'Verifies API consumer and provider agree on schema'],
      ['What is mutation testing?', 'Checks if tests catch intentional code mutations'],
      ['What is flaky test?', 'Test that passes and fails non-deterministically'],
    ],
  },

  // ── dev16 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev16. 🔄 CI/CD',
    description: 'GitHub Actions, deployment strategies, pipelines, and release practices',
    cards: [
      ['What is CI?', 'Automated build and test on every code push'],
      ['What is Continuous Delivery?', 'Auto-deploys to staging; humans approve production'],
      ['What is Continuous Deployment?', 'Auto-deploys to production on every passing CI build'],
      ['What is a GitHub Actions workflow?', 'YAML file defining jobs triggered by repo events'],
      ['What is a job in GitHub Actions?', 'Set of steps running on one runner machine'],
      ['What is on: push syntax?', 'Triggers workflow when code is pushed to branch'],
      ['What is needs: in GitHub Actions?', 'Job waits for listed jobs to complete first'],
      ['What is a GitHub secret?', 'Encrypted env var stored in repo or org settings'],
      ['What does actions/checkout do?', 'Clones the repository into the runner'],
      ['What does actions/cache do?', 'Saves and restores files between workflow runs'],
      ['What is a blue-green deployment?', 'Switch traffic between two identical environments instantly'],
      ['What is a canary deployment?', 'Route small % of traffic to new version first'],
      ['What is a rolling deployment?', 'Replace old instances with new ones gradually'],
      ['What is a rollback?', 'Redeploy last known good version immediately'],
      ['What is a deployment gate?', 'Manual approval step before promoting to next environment'],
      ['What is a matrix build?', 'Runs same job across multiple OS/version combinations'],
      ['What is GITHUB_TOKEN?', 'Auto-generated token scoped to current workflow run'],
      ['What is semantic versioning?', 'MAJOR.MINOR.PATCH — breaks.features.fixes'],
      ['What is a release tag?', 'Git tag marking a specific versioned release commit'],
      ['What is conventional commits?', 'Structured commit format: feat, fix, chore, etc.'],
      ['What is a release please action?', 'Auto-creates release PRs from conventional commits'],
      ['What is environment protection rule?', 'Requires reviewers or wait time before deployment'],
      ['What is artifact in GitHub Actions?', 'File uploaded from one job, downloadable by others'],
    ],
  },

  // ── dev17 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev17. 📊 Observability',
    description: 'Logs, metrics, traces, OpenTelemetry, alerting, and SLOs',
    cards: [
      ['Three pillars of observability?', 'Logs, metrics, and traces'],
      ['What is structured logging?', 'Logs as JSON with queryable, typed fields'],
      ['What is a counter metric?', 'Monotonically increasing value — requests, errors'],
      ['What is a gauge metric?', 'Value that goes up and down — memory, queue depth'],
      ['What is a histogram metric?', 'Tracks distribution of values — request latency percentiles'],
      ['What is a trace?', 'End-to-end record of a request across multiple services'],
      ['What is a span?', 'Single unit of work within a distributed trace'],
      ['What is OpenTelemetry?', 'Vendor-neutral standard for instrumentation — logs, metrics, traces'],
      ['What is Prometheus?', 'Time-series metrics DB that scrapes /metrics endpoints'],
      ['What is PromQL?', 'Prometheus query language for slicing metric time series'],
      ['What is Grafana?', 'Visualization layer for Prometheus, Loki, Tempo, and others'],
      ['What is Loki?', "Grafana's log aggregation system — like Prometheus for logs"],
      ['What is Tempo?', "Grafana's distributed tracing backend"],
      ['What is an SLI?', 'Service Level Indicator — actual measured metric (e.g. error rate)'],
      ['What is an SLO?', 'Service Level Objective — target for an SLI (e.g. 99.9%)'],
      ['What is an SLA?', 'Service Level Agreement — contractual SLO with consequences'],
      ['What is an error budget?', 'Allowed downtime before SLO breach — (1 - SLO) × period'],
      ['What is alerting?', 'Firing notification when metric crosses a threshold'],
      ['What is a runbook?', 'Step-by-step guide for responding to a specific alert'],
      ['What is MTTR?', 'Mean Time To Recovery — average incident resolution time'],
      ['What is MTTD?', 'Mean Time To Detect — average time to notice an incident'],
      ['What is a flame graph?', 'Visualizes CPU time across call stack — wide = slow'],
      ['What is distributed tracing?', 'Propagates trace context across service boundaries'],
      ['What is tail-based sampling?', 'Decides whether to keep a trace after it completes'],
      ['What is log sampling?', 'Record only a fraction of high-volume log events'],
    ],
  },

  // ── dev18 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev18. 🔀 Git Workflows',
    description: 'Branching strategies, rebase, merge, PR culture, and git internals',
    cards: [
      ['What is trunk-based development?', 'Everyone commits to main; branches are short-lived'],
      ['What is gitflow?', 'Feature/release/hotfix branches off develop and main'],
      ['What is a fast-forward merge?', 'No merge commit — linear history, branch just moves pointer'],
      ['What is git rebase?', 'Replays commits on top of another branch — linear history'],
      ['What is git rebase -i?', 'Interactive rebase — squash, reorder, reword commits'],
      ['What is squash merge?', 'Condenses all PR commits into one on target branch'],
      ['What is a merge commit?', 'Commit recording where two branch histories joined'],
      ['What is git cherry-pick?', 'Applies a specific commit to current branch'],
      ['What is git bisect?', 'Binary searches commit history to find regression'],
      ['What is git stash?', 'Temporarily shelves uncommitted working tree changes'],
      ['git reset --hard does?', 'Moves HEAD and discards all working tree changes'],
      ['git reset --soft does?', 'Moves HEAD but keeps changes staged'],
      ['What is git reflog?', 'History of all HEAD movements — recovery tool'],
      ['What makes a good PR description?', 'Context, what changed, how to test, screenshots'],
      ['What is CODEOWNERS?', 'Auto-assigns reviewers based on file path patterns'],
      ['What is branch protection?', 'Requires CI pass and review before merging to main'],
      ['What is git blame?', 'Shows who last modified each line and in which commit'],
      ['What is a detached HEAD?', 'HEAD points to a commit, not a branch — be careful'],
      ['git fetch vs git pull?', 'fetch: download only; pull: fetch then merge'],
      ['What is --force-with-lease?', 'Safe force push — fails if remote has changed since fetch'],
      ['What is semantic commit format?', 'type(scope): short description — feat, fix, chore, docs'],
      ['What is a rebase conflict?', 'Same lines changed in both branches — must resolve manually'],
    ],
  },

  // ── dev19 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev19. 🤖 AI & LLM Integration',
    description: 'LLM APIs, RAG, embeddings, vector search, and production patterns',
    cards: [
      ['What is an LLM?', 'Large language model — predicts most likely next token'],
      ['What is a token?', '~4 characters of text in model input/output'],
      ['What is a context window?', 'Maximum tokens model processes in one call'],
      ['What is RAG?', 'Retrieval-Augmented Generation — inject relevant docs into context'],
      ['What is an embedding?', 'Dense vector representing semantic meaning of text'],
      ['What is cosine similarity?', 'Measures angle between vectors — near 1 means similar'],
      ['What is a vector database?', 'Stores embeddings and retrieves by similarity search'],
      ['What is pgvector?', 'Postgres extension for vector storage and similarity queries'],
      ['What is chunking in RAG?', 'Splitting documents into pieces sized for embedding'],
      ['What is semantic search?', 'Search by meaning not keywords — embedding similarity'],
      ['What is a system prompt?', 'Persistent instruction at start of model context'],
      ['What is temperature in LLMs?', 'Controls output randomness — 0 deterministic, 1 creative'],
      ['What is streaming in LLM APIs?', 'Partial tokens sent as server-sent events in real time'],
      ['What is tool use / function calling?', 'Model decides to invoke a defined function with arguments'],
      ['What is max_tokens?', 'Cap on length of model response'],
      ['What is prompt injection?', 'Adversarial input hijacking system instructions'],
      ['What is fine-tuning?', 'Further training on domain-specific examples'],
      ['What is an agent?', 'LLM in a loop — reasons, uses tools, acts autonomously'],
      ['What is multi-turn conversation?', 'Conversation history sent as messages array each call'],
      ['Message roles in API?', 'system, user, assistant — define speaker of each turn'],
      ['What is structured output?', 'Constrain model response to a specific JSON schema'],
      ['What is a reranker?', 'Re-scores retrieved chunks by relevance before injecting'],
      ['What is context stuffing?', 'Filling entire context window with retrieved documents'],
      ['What is a hybrid search?', 'Combines keyword (BM25) and semantic (vector) search'],
    ],
  },

  // ── dev20 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev20. 💼 Behavioral & Remote',
    description: 'STAR method, async communication, ownership, and remote work signals',
    cards: [
      ['What is the STAR method?', 'Situation, Task, Action, Result — structures answers'],
      ['How to quantify STAR impact?', 'Numbers: cut latency 40%, saved $X, unblocked N engineers'],
      ['What does senior ownership mean?', 'Drives feature from spec to deploy without prompting'],
      ['What is async-first communication?', 'Default to written, documented, non-blocking updates'],
      ['What signals remote reliability?', 'Predictable hours, proactive status, documented decisions'],
      ['What is over-communication remotely?', 'Sharing context before anyone has to ask'],
      ['How to handle ambiguous requirements?', 'Write a spec, share for feedback, align before building'],
      ['What is a tech spec / RFC?', 'Written design doc shared for review before implementation'],
      ['What is scope creep?', 'Requirements growing beyond original agreement'],
      ['How to handle tech disagreement?', 'Present trade-offs in writing; propose a time-boxed experiment'],
      ['What makes a good code review comment?', 'Specific, actionable, explains the why — not just what'],
      ['What is a blameless postmortem?', 'Focuses on system fixes and timeline — not individual fault'],
      ['What is oncall?', 'Being responsible for responding to production incidents on schedule'],
      ['How do seniors estimate tasks?', 'Break down, add buffer, communicate uncertainty explicitly'],
      ['What is DORA deployment frequency?', 'How often you deploy to production — higher is healthier'],
      ['What is DORA lead time?', 'Commit to production time — shorter means faster delivery'],
      ['What is DORA MTTR?', 'Mean Time To Recovery — how fast incidents are resolved'],
      ['What is DORA change failure rate?', '% of deployments causing incidents — lower is better'],
      ['What demonstrates senior comms?', 'Clear, skimmable docs, PR descriptions, and async updates'],
    ],
  },

  // ── dev21 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev21. 🟩 Node.js Internals',
    description: 'Event loop, streams, modules, clustering, and runtime internals',
    cards: [
      ['What is the Node.js event loop?', 'C++ libuv loop executing JS callbacks asynchronously'],
      ['Node.js event loop phases order?', 'timers → I/O callbacks → idle → poll → check → close'],
      ['What is the poll phase?', 'Waits for I/O events, executes their callbacks'],
      ['What is the check phase?', 'Runs setImmediate callbacks'],
      ['setImmediate vs setTimeout(0)?', 'setImmediate: after I/O; setTimeout: after timer expires'],
      ['process.nextTick runs when?', 'Before any I/O — top of microtask queue'],
      ['What is libuv?', 'C library providing async I/O, thread pool, event loop'],
      ['What is the thread pool?', 'Four threads handling blocking ops: fs, crypto, DNS'],
      ['What is a Node.js stream?', 'Abstract interface for reading/writing data in chunks'],
      ['Four stream types?', 'Readable, Writable, Duplex, Transform'],
      ['What is backpressure in streams?', 'Writable signals readable to slow down when buffer full'],
      ['What is stream piping?', 'Connects readable output directly to writable input'],
      ['What is a Buffer?', 'Fixed-size chunk of raw binary data outside V8 heap'],
      ['CommonJS vs ESM require?', 'CJS: synchronous require(); ESM: static import/export'],
      ['What is __dirname in CJS?', 'Absolute path of current module\'s directory'],
      ['What is process.env?', 'Object exposing environment variables at runtime'],
      ['What is cluster module?', 'Forks worker processes sharing one server port'],
      ['What is worker_threads?', 'True threads sharing memory — for CPU-bound work'],
      ['When to use worker_threads?', 'CPU-heavy tasks that would block the event loop'],
      ['What is child_process.spawn?', 'Spawns new process, returns streams for stdio'],
      ['What is child_process.exec?', 'Runs shell command, buffers full output as callback'],
      ['What is the V8 heap?', 'Memory managed by V8 for JS objects and closures'],
      ['What is --max-old-space-size?', 'Flag to increase V8 heap limit in MB'],
      ['What is garbage collection in V8?', 'Orinoco: incremental mark-and-sweep collector'],
      ['What is a Node.js REPL?', 'Interactive Read-Eval-Print Loop for running JS'],
      ['What is global in Node.js?', 'Global object equivalent to window in browsers'],
      ['What does npm ci do?', 'Clean install from lock file — deterministic, faster in CI'],
      ['What is package-lock.json?', 'Exact resolved dependency tree for reproducible installs'],
    ],
  },

  // ── dev22 ─────────────────────────────────────────────────────────────────
  {
    name: 'dev22. 🎨 CSS & Tailwind',
    description: 'CSS fundamentals, layout, Tailwind utility patterns, and responsive design',
    cards: [
      ['What is the CSS box model?', 'Content → padding → border → margin'],
      ['box-sizing: border-box does?', 'Padding and border included in element\'s width/height'],
      ['What is specificity?', 'Inline > ID > class > element — determines which rule wins'],
      ['What is the cascade?', 'Later rules with equal specificity override earlier ones'],
      ['What is a CSS custom property?', 'var(--name) — inheritable token defined with --name'],
      ['What is flexbox main axis?', 'Direction set by flex-direction — row or column'],
      ['flex: 1 shorthand means?', 'flex-grow:1 flex-shrink:1 flex-basis:0 — fill space'],
      ['What is CSS Grid?', 'Two-dimensional layout with rows and columns'],
      ['grid-template-columns: repeat(3, 1fr)?', 'Three equal-width columns filling available space'],
      ['What is position: sticky?', 'Sticks to viewport edge while parent is in view'],
      ['What is z-index stacking context?', 'Isolated layer — z-index only compares within context'],
      ['What is a media query?', '@media (min-width: 768px) — applies styles at breakpoint'],
      ['Mobile-first vs desktop-first?', 'Mobile-first: min-width breakpoints; desktop-first: max-width'],
      ['What is Tailwind\'s utility-first?', 'Compose design directly with single-purpose classes'],
      ['What is Tailwind JIT?', 'Generates only used CSS classes — tiny production bundle'],
      ['Tailwind sm: prefix means?', 'Applies at 640px and above — mobile-first breakpoint'],
      ['Tailwind dark: prefix means?', 'Applies when dark mode is active (class or media)'],
      ['Tailwind hover: prefix means?', 'Applies styles on hover state'],
      ['What is Tailwind @apply?', 'Extracts utilities into a CSS class — use sparingly'],
      ['What is Tailwind config extend?', 'Adds custom values without replacing defaults'],
      ['What is a Tailwind plugin?', 'Adds custom utilities, components, or variants'],
      ['What is CSS-in-JS?', 'Styles defined as JS objects — co-located with component'],
      ['What is a CSS reset?', 'Removes browser default styles for consistent baseline'],
      ['What is will-change?', 'Hints browser to promote element to compositor layer'],
      ['What causes layout thrashing?', 'Interleaved DOM reads and writes forcing repeated reflow'],
      ['What is contain: layout?', 'Scopes layout calculations to subtree — performance win'],
      ['What is clamp() in CSS?', 'clamp(min, preferred, max) — fluid responsive sizing'],
    ],
  },
]

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx tsx scripts/seed-dev-decks.ts your@email.com')
    process.exit(1)
  }

  const [user] = await db
    .select({ id: authSchema.authUsers.id })
    .from(authSchema.authUsers)
    .where(eq(authSchema.authUsers.email, email))

  if (!user) { console.error(`No user: ${email}`); process.exit(1) }
  const uid = user.id
  console.log(`\nUser: ${email} (${uid})\n`)

  let totalDecks = 0, totalCards = 0, skipped = 0

  for (const deck of DECKS) {
    const existing = await db
      .select({ id: schema.srsDecks.id })
      .from(schema.srsDecks)
      .where(and(eq(schema.srsDecks.ownerUid, uid), eq(schema.srsDecks.name, deck.name)))

    if (existing.length > 0) {
      console.log(`  ⏭  Skipping "${deck.name}"`)
      skipped++
      continue
    }

    const [newDeck] = await db
      .insert(schema.srsDecks)
      .values({ id: nanoid(), ownerUid: uid, name: deck.name, description: deck.description })
      .returning({ id: schema.srsDecks.id })

    const deckId = newDeck.id
    let cardCount = 0

    for (const [front, back] of deck.cards) {
      const cardId = nanoid()
      await db.insert(schema.srsCards).values({ id: cardId, ownerUid: uid, deckId, front, back })
      await db.insert(schema.srsCardStates).values({ id: cardId, ownerUid: uid, deckId, srs: newSrs() })
      cardCount++
    }

    console.log(`  ✓  "${deck.name}" — ${cardCount} cards`)
    totalDecks++
    totalCards += cardCount
  }

  console.log(`\n✅  Done — ${totalDecks} decks created, ${totalCards} cards inserted, ${skipped} skipped\n`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
