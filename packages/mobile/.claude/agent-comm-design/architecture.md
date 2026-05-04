# Universal Agent Communication Mechanism — Architecture Design

## 1. Communication Model

### Core Substrate: Shared File Store

The system uses a **shared directory** (local or git-synced) as its sole communication substrate. Every message is a file on disk. This is the only infrastructure primitive required.

**Three deployment modes, one protocol:**

| Mode | Substrate | Use Case |
|------|-----------|----------|
| Local | `.claude/conversations/` in a shared workspace | Same-machine, same-repo agents |
| Git-backed | A shared Git repo (e.g., `org/agent-messages`) | Distributed team across machines |
| Hybrid | Git repo + local cache | Cross-team async collab |

### Communication Primitives (all file-based)

1. **Direct Messaging (Unicast)** — Agent A writes a file into Agent B's inbox directory. Agent B discovers it on its next poll/session start.

2. **Broadcast** — Agent A writes a message into the common channel directory. All agents discover it by scanning the directory (optionally filtered by topic tags).

3. **Request/Reply** — Agent A writes a message with `replyTo: <original-message-id>` and `expects: "response"`. Agent B writes a new message with `inReplyTo: <original-message-id>`. Correlation is done via message IDs — no blocking wait needed.

4. **Pub/Sub via Topic Directories** — Messages are written into topic-named subdirectories (e.g., `topics/auth-design/`). Agents subscribe by scanning topic directories they care about.

**Selection rationale**: Files are the one universal primitive across all Claude Code sessions (Read, Write, Bash/ls, Bash/git). No sockets, no servers, no databases. Every agent already has these tools.

---

## 2. Message Protocol

### Message Schema (JSON — one file per message)

Every message is a JSON file. The filename **is** the message ID.

```
{conversation-dir}/
  messages/
    msg_<uuid>.json
```

```jsonc
{
  // --- REQUIRED FIELDS ---
  "id": "msg_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "message",             // "message" | "system" | "reaction" | "join" | "leave" | "ack"
  "sender": "agent-alpha",       // unique agent identifier
  "timestamp": "2026-05-03T14:30:00.000Z", // ISO 8601 UTC
  "body": "Here is the architecture proposal...",

  // --- ADDRESSING ---
  "to": ["agent-beta", "agent-gamma"],  // specific recipients; omit or ["*"] for broadcast
  "cc": ["agent-delta"],                // optional CC list (informational)

  // --- THREADING ---
  "threadId": "thread_001",            // groups messages into a conversation
  "inReplyTo": "msg_<uuid>",           // for threaded replies (optional)
  "subject": "Re: Architecture Review",  // human-readable subject line

  // --- ROUTING & EXPECTATIONS ---
  "expects": "response",               // "none" | "response" | "ack"
  "priority": "normal",                // "low" | "normal" | "high" | "urgent"
  "ttl": 86400,                        // seconds before sender considers agent unresponsive

  // --- METADATA ---
  "version": "1.0",
  "schema": "agent-message-v1",
  "tags": ["architecture", "design-review"],
  "mentions": ["agent-delta"],         // explicit @-mentions
  "attachments": [                     // references to context files
    {"name": "context-file", "path": "relative/path/to/file.json"}
  ]
}
```

### Threading Model

- **`threadId`** groups messages into conversations. All messages sharing a `threadId` belong to the same logical thread.
- **`inReplyTo`** creates parent-child relationships for tree-structured discussion.
- **Thread index** is maintained as a separate metadata file: `{conversation}/threads/thread_001/index.json` (summary of the thread, last activity timestamp, participant list). Updated by convention on every new message.

### Reactions

A reaction is a **separate message** of type `"reaction"`:

```json
{
  "id": "msg_r_<uuid>",
  "type": "reaction",
  "sender": "agent-beta",
  "inReplyTo": "msg_a1b2c3d4-...",
  "body": "+1",         // "+1" | "-1" | "rocket" | "eyes" | "heart" | etc.
  "timestamp": "..."
}
```

### Acknowledgment Protocol

When `expects: "ack"`, the recipient writes a minimal `type: "ack"` message referencing the original. This lets the sender know the message was received. Acks are discovered on the next poll.

```json
{
  "id": "msg_ack_<uuid>",
  "type": "ack",
  "sender": "agent-beta",
  "inReplyTo": "msg_a1b2c3d4-...",
  "timestamp": "..."
}
```

---

## 3. Session & Identity

### Agent Identity

Each agent maintains a **identity file** that persists across sessions:

```
.claude/agent-identity.json
```

```json
{
  "agentId": "agent-alpha",
  "displayName": "Agent Alpha — Systems Architect",
  "role": "architect",
  "publicKey": "ecdsa-p256:<base64-key>",
  "version": "1.0",
  "capabilities": ["architecture-design", "code-review", "typescript", "systems-thinking"],
  "lastSeen": "2026-05-03T14:30:00.000Z"
}
```

### Session Lifecycle

1. **On session start** (SessionStart hook):
   - Agent loads its identity file (or creates one with a new UUID if first run).
   - Agent writes a `type: "join"` message to the conversation inbox.
   - Agent pulls latest messages from the shared store (git pull if git-backed).

2. **During session**:
   - Agent polls for new messages by scanning (and optionally `git pull`-ing).
   - Agent processes messages addressed to it (checking `to`, `cc`, `mentions`, broadcast).
   - Agent writes responses and new messages.

3. **On session end** (Stop hook — controlled exit):
   - Agent writes a `type: "leave"` message.
   - Agent updates its `lastSeen` timestamp in the identity file.
   - If git-backed: agent commits and pushes all pending messages.

4. **Crash recovery** (uncontrolled exit):
   - No `leave` message — other agents detect absence via stale `lastSeen`.
   - On next start, agent detects unprocessed messages (those with `expects: "response"` and no matching reply or ack).

### Agent Discovery

Two mechanisms, used together:

**a) Identity directory**: Agents publish their identity files to a well-known directory:

```
{shared-root}/
  agents/
    agent-alpha.json      # identity file (symlink or copy)
    agent-beta.json
    agent-gamma.json
```

Agents scan this directory to discover who is participating. The `lastSeen` field tells them if an agent is currently active.

**b) Join/Leave messages**: When an agent joins or leaves a conversation, it writes a `type: "join"` or `type: "leave"` message to the conversation. This appears in the message stream and is processed like any other message.

**c) Heartbeat** (optional, for real-time-ish awareness): Agents can periodically write heartbeat messages (every N minutes) to signal they are still online. A separate inotify/poll watcher can detect these. Omit for simplicity in v1.

---

## 4. State & Consistency

### Conversation Structure

```
{shared-root}/
  agent-messages/
    AGENTS_README.md              # protocol docs, conventions
    agents/
      agent-alpha.json            # identity file for each agent
      agent-beta.json
    conversations/
      cv_001_architecture-review/
        metadata.json             # conversation metadata, participant list
        threads/
          thread_001/
            index.json            # thread summary
            messages/
              msg_<uuid>.json
              msg_<uuid>.json
          thread_002/
            index.json
            messages/
              msg_<uuid>.json
        index.json                # list of threads in this conversation
      cv_002_api-design/
        ...
```

### Context Sharing (State Beyond Messages)

Agents share structured context via **context files** — JSON files that any agent can read/write:

```
{shared-root}/
  context/
    architecture-proposal-v2.json    # shared context artifact
    decision-log.json               # ADR-style decision records
    shared-todos.json                # cross-agent task tracking
    schema.json                      # shared data model
```

These are NOT messages — they are shared mutable state. Agents modify them via file overwrite. For write conflicts, use a **last-writer-wins** policy with a version field, or (for git-backed) rely on git merge.

### Consistency Rules

1. **Messages are append-only and immutable.** Once written, a message file is never modified. This eliminates write conflicts.
2. **Context files are mutable** but agents should append rather than overwrite where possible (e.g., decision log is an array that grows).
3. **Read-timestamp tracking**: Each agent maintains a local cursor file noting the last message it processed:

```jsonc
// .claude/agent-cursor.json
{
  "agentId": "agent-alpha",
  "cursors": {
    "cv_001": "msg_<last-processed-uuid>",
    "cv_002": "msg_<last-processed-uuid>"
  }
}
```

On session start, the agent reads all messages after its cursor. This ensures at-least-once processing (agents must handle duplicates idempotently via message ID).

### Offline Handling

- If Agent B is offline when Agent A sends a message: the message file sits in the inbox/message directory. Agent B processes it when it next starts and discovers unread messages (messages with `timestamp` after its cursor).
- If an agent fails to respond within `ttl` seconds of a message with `expects: "response"`, the sender can escalate (e.g., broadcast a reminder or skip the dependency).
- **TTL check is done locally** by the sender when it polls: it reads messages it sent, checks if any `expects: "response"` have no reply with `inReplyTo` matching its message ID, and if `now - original.timestamp > ttl`, it escalates.

### Git-backed Consistency

When using Git as the transport layer:
- **Pull before read**, **commit after write**, **push after commit**.
- Each message file is committed individually (small, atomic commits).
- Merge conflicts on message files are impossible (append-only, unique filenames).
- Merge conflicts on context files are possible; agents should use a merge driver or manual resolution.
- For identity files, agents overwrite their own entries (last-writer-wins per agent).

---

## 5. Security Model

### Agent Identity Verification (v2)

**Ed25519 key pairs** (simple, Claude Code can generate them via `openssl` or Node.js crypto):

```bash
openssl genpkey -algorithm ed25519 -out agent-key.pem
openssl pkey -in agent-key.pem -pubout -out agent-key.pub
```

Each message is signed with the agent's private key. The signature is included as an optional field:

```json
{
  "id": "msg_...",
  "sender": "agent-alpha",
  // ... all other fields ...
  "signature": "<base64-encoded-ed25519-signature>",
  "signingKeyId": "agent-alpha-v1"  // references the public key in agent identity
}
```

The message body being signed is the canonical JSON (sorted keys, no whitespace) of ALL fields except `signature` itself.

**Verification protocol**:
1. Receiving agent loads sender's public key from `agents/agent-alpha.json`.
2. Receiving agent reconstructs the canonical JSON of the message body.
3. Receiving agent verifies the signature using Ed25519.
4. Invalid signatures are flagged but NOT dropped (to allow graceful degradation). Flagged messages are processed but logged as potentially compromised.

### Trust-on-First-Use (TOFU)

- On first encounter of an agent, its public key is recorded from its identity file.
- If a public key changes, the agent must also publish a `type: "system"` message with the old key signing the statement "I am rotating my key to <new-key-fingerprint>".
- Without key rotation verification, key changes are flagged to human operators.

### Authorization (Who Can Join?)

Three trust levels:

| Level | Mechanism | Use Case |
|-------|-----------|----------|
| **Open** | Any agent with a signed identity can join | Team-internal, trusted network |
| **Invite-only** | A `conversations/X/metadata.json` has an `allowedAgents` list. Agents not on the list are ignored. | Cross-team collab |
| **Git-authenticated** | Only agents whose commits are signed by approved GPG keys can write messages | Production/security-critical |
| **Human-gated** | Messages from unknown agents are surfaced to a human for approval | External contributions |

### Practical Minimum for v1

**Skip signing entirely for v1.** The simplest viable security model:

1. Agent identity is self-asserted via the identity file (no crypto).
2. Git-based authentication: only team members with write access to the shared repo can participate (repository permissions serve as the trust boundary).
3. Each agent checks that messages come from known agent IDs (identity directory is the allowlist).
4. An agent detecting an impersonation attempt (same agentId, different identity fingerprint) writes a flagged message to the conversation.

### Rate Limiting & Abuse Prevention

- Agents should not process more than N messages per poll cycle (configurable, e.g., 50).
- If a single agent publishes messages faster than a threshold (e.g., 10/sec), other agents can throttle processing and write a warning.
- A `maxMessageSize` of 1 MB per message file prevents storage exhaustion (enforced by the writing agent's own convention).

---

## 6. Runtime Operation: Agent Poll Loop

Every agent runs this loop periodically (every 5-30 seconds during an active session, or on session start):

```
1. PULL (git pull if git-backed)
2. SCAN messages directory for new messages (compare against local cursor)
3. FILTER messages addressed to self (to, cc, mentions, broadcast)
4. VERIFY signatures (optional, v2)
5. PROCESS messages:
   a. If type="ack": mark original message as acknowledged
   b. If type="reaction": record reaction
   c. If type="message":
      - Parse body
      - Generate response (if expects="response")
      - Write response message file
   d. If type="system" (join/leave): update cached participant list
   e. If type="join": acknowledge by noting the agent in participant list
6. CHECK sent messages for unacknowledged/unanswered (TTL expiry)
7. UPDATE cursor file with last processed message ID
8. PUSH (git add + commit + push if git-backed)
```

---

## 7. Practical Implementation: Bootstrap Script

The core can be delivered as a single shell script or `agent-comm` MCP tool that wraps all operations:

```bash
# Core commands (backed by the file protocol):
agent-msg send --to agent-beta --body "Please review the architecture" \
  --thread cv_001 --expects response --attach ./proposal.json

agent-msg reply --in-reply-to msg_abc123 --body "Reviewed, looks good."

agent-msg read [--since <cursor>] [--thread cv_001] [--unread]

agent-msg status --show-agent agent-beta  # last seen, outstanding messages

agent-msg join --conversation cv_001 --role architect
agent-msg leave --conversation cv_001
```

This is a thin shell script that writes/reads JSON files to the standard directory structure. No dependencies beyond `jq` (for JSON manipulation in bash) or Node.js.

---

## Summary

| Concern | Mechanism |
|---------|-----------|
| Discovery | Shared `agents/` directory + join/leave messages |
| Messaging | JSON files in `conversations/*/threads/*/messages/` |
| Addressing | `to`, `cc`, `mentions` fields in message schema |
| Threading | `threadId` + `inReplyTo` fields |
| Async comm | Messages persist as files; agents process on next poll |
| State/context | Mutable context files in `context/` directory |
| Consistency | Append-only messages + cursor-based read tracking |
| Sync transport | Git (optional) for distributed agents |
| Identity | Self-asserted UUID in `.claude/agent-identity.json` |
| Auth (v1) | Git permissions + agent allowlist |
| Auth (v2) | Ed25519 message signing + TOFU key verification |
| Offline handling | TTL-based timeout + cursor-based catch-up on rejoin |

This architecture requires **zero external infrastructure** beyond a filesystem (and optionally git). It maps directly to the Claude Code toolset, is fully async, supports arbitrary numbers of agents, and can be implemented incrementally starting with simple JSON file I/O.
