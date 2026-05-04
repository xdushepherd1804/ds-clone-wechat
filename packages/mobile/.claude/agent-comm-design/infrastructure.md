# Universal Agent Communication Mechanism — Infrastructure Design

**Author:** Agent Beta (Infrastructure Engineer)
**Version:** 1.0

---

## 1. Storage Design

### 1.1 Base Directory

```
First check:  $AGENT_COMM_HOME          (env var override)
Fallback:     $HOME/.agent-comm/        (user-level, cross-project)
```

### 1.2 Directory Layout

```
~/.agent-comm/
  VERSION                           # schema version ("1")
  registry/
    <agent-id>.agent.json           # agent identity + capability advertisement
  mailboxes/
    <recipient-id>/
      inbox/                        # unread messages (new deliveries)
      processing/                   # message being handled (in-flight)
      done/                         # processed + acknowledged
      dead/                         # undeliverable / poison messages
  conversations/
    <conv-id>.conv.json             # conversation metadata and index
  sent/
    <sender-id>/
      <message-id>.msg.json         # sender's copy of each sent message
  locks/
    <lock-name>.lock                # mkdir-based mutual exclusion sentinels
```

### 1.3 File Formats

#### Identity File: `registry/<agent-id>.agent.json`

```json
{
  "schema_version": 1,
  "agent_id": "agent-alpha",
  "display_name": "Agent Alpha",
  "role": "frontend-engineer",
  "capabilities": ["react", "typescript", "design-review"],
  "status": "online",
  "last_seen": "2026-05-03T14:30:00Z",
  "session_id": "sess-a1b2c3",
  "worktree": "/path/to/worktree",
  "metadata": {}
}
```

#### Message File: `mailboxes/<recipient>/inbox/<message-id>.msg.json`

```json
{
  "schema_version": 1,
  "message_id": "msg_01J2XY3ABCDEFGHIJKLMNOPQR",
  "conversation_id": "conv_01J2XY3ABCDEFGHIJKLMNOPQS",
  "type": "message",
  "from": "agent-alpha",
  "to": ["agent-beta"],
  "cc": ["agent-gamma"],
  "subject": "Design proposal: message schema",
  "body": "I propose we use JSON Schema Draft 2020-12 ...",
  "body_format": "markdown",
  "reply_to": null,
  "references": ["msg_01J2XY3...", "msg_01J2XY4..."],
  "timestamp": "2026-05-03T14:31:00.000Z",
  "ttl_seconds": 86400,
  "priority": "normal",
  "attachments": [
    {
      "name": "schema.json",
      "content_type": "application/json",
      "path": "/path/to/file",
      "size": 2048
    }
  ],
  "metadata": {
    "source_session": "sess-a1b2c3",
    "source_worktree": "/path/to/worktree"
  }
}
```

**Message types:**

| Type | Purpose |
|------|---------|
| `message` | Standard async message |
| `request` | Expects a response (blocks sender) |
| `response` | Reply to a `request` |
| `broadcast` | To all agents (no `to` field) |
| `ack` | Delivery acknowledgment (system-generated) |
| `heartbeat` | Aliveness signal |
| `status` | Status update (agent went offline, etc.) |

#### Conversation Index: `conversations/<conv-id>.conv.json`

```json
{
  "schema_version": 1,
  "conversation_id": "conv_01J2XY3ABCDEFGHIJKLMNOPQS",
  "subject": "Design proposal: message schema",
  "participants": ["agent-alpha", "agent-beta", "agent-gamma"],
  "status": "active",
  "message_count": 5,
  "message_ids": ["msg_01J2XY3...", "msg_01J2XY4...", "msg_01J2XY5..."],
  "created": "2026-05-03T14:31:00Z",
  "updated": "2026-05-03T15:45:00Z",
  "tags": ["design", "schema", "v2"]
}
```

---

## 2. Message Queue / Mailbox

### 2.1 Delivery Model

Pull-based with optional watch mode. No persistent daemon needed.

**Send path:**
1. Sender generates UUID for `message_id` and `conversation_id`
2. Atomic write: `.tmp` → `mv` to `inbox/<message-id>.msg.json`
3. Sender writes copy to `sent/<sender>/<message-id>.msg.json`
4. Sender updates conversation index

**Receive path:**
1. List `inbox/*.msg.json`
2. Move to `processing/` (atomic `mv`)
3. Process message
4. Move to `done/`
5. Optionally send `ack` to sender

### 2.2 Watch Mode

```bash
agent watch --timeout 300
```

- **macOS:** `fswatch` or kqueue wrapper
- **Linux:** `inotifywait`
- **Fallback:** Poll every N seconds with `find -newer`

### 2.3 Queue Semantics

| Property | Guarantee |
|----------|-----------|
| At-least-once delivery | Message stays in `sent/` until purged. Processing moves prevent loss |
| Ordering | Best-effort by `timestamp`; strict ordering via `metadata.sequence` |
| Fan-out | Each recipient gets copy in their inbox |
| TTL | Messages garbage collected after `ttl_seconds` |
| Dead letter | Unprocessable → `dead/` |

---

## 3. CLI Interface

### Core Commands

```bash
# Identity
agent init --id agent-alpha --name "Agent Alpha" --role "architect"
agent whoami
agent list
agent info agent-beta
agent status set busy|offline|online

# Sending
agent send --to agent-beta "Can you review my PR?"
agent send --to agent-beta --subject "Review: auth" --file ./proposal.md
agent send --to agent-beta --reply-to conv_xyz "Updated schema"
agent request --to agent-beta --timeout 3600 "What port?"
agent broadcast "Standup: working on message inbox"

# Checking
agent check
agent check --from agent-alpha --count 5 --show-body
agent check --watch           # continuous watch mode
agent ack msg_xyz

# Conversations
agent conv list
agent conv show conv_xyz --last 10
agent conv close conv_xyz
agent conv tag conv_xyz --add "design"

# Maintenance
agent gc                       # garbage collect
agent archive --before 30      # archive old conversations
agent stats                    # statistics
agent fsck                     # validate store integrity
```

### JSON Output Mode

```bash
agent check --json
# → {"count":3,"messages":[...]}

agent conv list --json
# → [{"conversation_id":"conv_...","subject":"...","message_count":3},...]
```

---

## 4. Reliability

### Crash Recovery

| Scenario | Recovery |
|----------|----------|
| Sender crash before mv | `.tmp` remains; retry on next run; `message_id` prevents duplicates |
| Recipient crash during processing | Message in `processing/` re-detected and re-processed |
| Agent offline without heartbeat | Messages queue in inbox; re-register on restart |
| Simultaneous writes | UUID filenames prevent collision |

### Deduplication

Every message has a globally unique `message_id`. The `done/` directory serves as a processed-ID registry.

### Ordering

- Within sender: `metadata.sequence` counter per conversation
- Across senders: best-effort `timestamp` (ISO 8601)
- Sequence gaps detected → request re-send

### Lock Files

```bash
acquire_lock() {
  local lockdir="$AGENT_COMM_HOME/locks/$1.lock"
  mkdir "$lockdir" 2>/dev/null && return 0
  # Check stale lock (>60s)
  # ...
}
```

---

## 5. Implementation Stack

### Primary: Bash 4+ with `jq`

- Available everywhere (Linux, macOS)
- No dependencies beyond standard Unix tools
- `jq` for JSON parsing; `uuidgen` for IDs

### Optional: Node.js

- Native JSON without `jq`
- Better file watching (`fs.watch`)
- Better error messages

### Implementation Structure

```
$AGENT_COMM_HOME/
  bin/
    agent          # Main CLI entry point (bash)
  lib/
    agent.sh       # Shared functions
    json.sh        # JSON helpers
    lock.sh        # Locking primitives
    watch.sh       # File watching
    uuid.sh        # UUID generation
```

---

## 6. Persistence & Backup

### Git Backed Store (Recommended)

```bash
cd ~/.agent-comm && git init
echo "locks/" > .gitignore
echo "*.tmp" >> .gitignore
```

Auto-commit on each send/receive for full audit trail.

### Archival

```bash
agent archive --before 30
```

- Moves to `archive/YYYY/MM/`
- Optional gzip compression

### Retention

| Scope | Retention |
|-------|-----------|
| Active conversations | Indefinite |
| Archived | 90 days default |
| Undelivered | TTL-based (7 days) |
| Dead letter | 30 days |

---

## 7. Security

| Concern | Mitigation |
|---------|------------|
| Spoofed identity | Registry cross-check + session token |
| Tampering | Optional HMAC-SHA256 signature |
| Unauthorized access | `700` permissions on `$AGENT_COMM_HOME` |
| Replay attacks | `message_id` dedup + timestamp freshness |
| Encryption | Optional: age/PGP per-message body encryption |

---

## 8. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage format | JSON files | Structured, git-friendly, human-readable |
| Delivery model | Pull + optional watch | No daemon, fits Claude Code sessions |
| Agent identity | File-based registry | Simple, no external service |
| Message dedup | UUID + processed-set | No coordination needed |
| Concurrency | mkdir-based locks | Atomic filesystem level |
| CLI | Bash script | Zero-dependency |
| Backup | Git backing | Full history, cross-machine sync |
| Ordering | Best-effort timestamps + sequence numbers | Good enough for async |
