# Product Design: Universal Agent Communication Mechanism

## 1. Collaboration Patterns

### 1.1 Brainstorming
Multiple agents propose ideas on a shared topic, each posting separate messages. The initiator synthesizes or calls a vote. Messages are flat (no deep nesting) to preserve context.

| Role | Behavior |
|---|---|
| Facilitator | Posts the brief, sets rules (timebox, format), collects output |
| Contributor | Posts one idea per message, can +1/-1 others |
| Synthesizer | Summarizes into a structured output file |

**File convention**: `brainstorm--{topic-slug}.md` stored in `.claude/agent-comm/discussions/`.

### 1.2 Async Design Reviews
Agent A writes a proposal (code, mock, doc). One or more reviewers leave structured feedback per section.

Protocol:
1. A posts `@review <file-path>` to the channel.
2. Each reviewer posts `<file>:<line-range> -- <comment>` format messages.
3. A resolves threads by posting `@resolve <message-id>`.
4. On all resolved, A posts `@sign-off` and the review is archived.

### 1.3 Delegation
An agent requests another agent to perform a sub-task and report back.

- **Request**: `@agent-b do("task description", { context_ref: "...", timeout: 600 })`
- **Accept/Decline**: B replies with `@accept` or `@decline(reason)`.
- **Report**: B posts `@report` with a summary and a reference to output files.
- **Escalation**: If B does not respond within `timeout`, A may re-route to another agent.

### 1.4 Voting / Consensus
Structured polling for decisions.

- `@vote "proposal" options: [A, B, C] deadline: <timestamp>`
- Each agent replies `@vote <option>`.
- Tally is computed by the initiator or a neutral arbiter.
- Tiebreaker: facilitator decides or `@coinflip`.

---

## 2. Conversation Lifecycle

### 2.1 States

```
IDLE -> ACTIVE -> FORKED -> MERGED -> ARCHIVED
                -> RESOLVED -> ARCHIVED
                -> STALE -> ARCHIVED
```

- **IDLE**: No active discussion.
- **ACTIVE**: Messages are being exchanged.
- **FORKED**: A sub-discussion was branched from the main thread.
- **MERGED**: Fork re-joined into the parent thread.
- **RESOLVED**: Goal reached, participants agree to close.
- **STALE**: No activity for the configured TTL (default 24h, configurable per channel).
- **ARCHIVED**: Terminal. Messages are read-only.

### 2.2 Initiation
Any agent can start a conversation by writing a topic file to the shared directory.

**File**: `.claude/agent-comm/channels/<channel-name>/conversations/<conversation-id>.json`

```json
{
  "id": "conv-20260503-abc123",
  "title": "Design review: notification service",
  "initiator": "gamma",
  "participants": ["alpha", "beta"],
  "state": "ACTIVE",
  "createdAt": "2026-05-03T10:00:00Z",
  "context": {
    "type": "design-review",
    "target": "packages/server-notification/src/router.ts"
  }
}
```

### 2.3 Invitation
When an agent is mentioned (`@agent-x`) in a conversation file, the invited agent discovers this by polling or via a SessionStart/Stop hook that checks for unread invites.

### 2.4 Termination
- **Graceful**: Any participant posts `@resolve [summary]`, all sign off, state becomes RESOLVED -> ARCHIVED.
- **Timeout**: A TTL trigger moves STALE conversations to ARCHIVED.
- **Forced**: A human posts `@close` in the conversation file.

### 2.5 Fork / Merge
- A participant posts `@fork <reason>`.
- A new sub-conversation is created with `parentId` pointing to the original.
- Participants may be a subset of the parent.
- Merge: Sub-conversation posts `@merge <parent-id>` with a summary. Parent updates state from FORKED to ACTIVE.

---

## 3. Human-in-the-Loop

### 3.1 Observation
A human can read all agent conversations in two ways:

1. **File Browsing**: All conversations are flat JSON files in `.claude/agent-comm/channels/`. The human opens any file.
2. **Summary Digest**: A markdown index file `.claude/agent-comm/SUMMARY.md` is auto-updated by the SessionStart hook with:
   - Active conversations
   - Conversations awaiting human input
   - Recently resolved threads

### 3.2 Participation
A human enters a conversation by:

- Editing a conversation JSON to set `humanInput: { requested: true, prompt: "..." }`.
- Writing a message file: `.claude/agent-comm/channels/<name>/messages/human-<timestamp>.json`.

Agents detect human input by polling the `humanInput` field or watching for new message files.

### 3.3 Approval Flows
For actions requiring human sign-off (deployments, destructive operations, API calls with side effects):

1. Agent posts `@human-approval <action-description>` in the conversation.
2. A message file is written with `type: "approval-request"`.
3. Human reviews and writes an approval file (or edits the request file to add `approved: true/false`).
4. Agent reads the decision and proceeds or aborts.

**Timeouts**: If no response in 30 minutes, the agent may (a) re-notify, (b) skip the action, or (c) proceed with a conservative default, depending on the `autoBehavior` setting for that channel.

---

## 4. Notification Design

### 4.1 Agent Notifications (File-based)

Each agent has an inbox file: `.claude/agent-comm/notifications/<agent-name>.inbox.json`

```json
[
  {
    "id": "notif-001",
    "type": "mention | invite | approval-request | deadline",
    "from": "gamma",
    "conversationId": "conv-abc123",
    "summary": "@alpha please review the notification router",
    "timestamp": "2026-05-03T10:05:00Z",
    "read": false
  }
]
```

**Discovery mechanism**: On every SessionStart and Stop hook:
1. Parse the inbox file.
2. Filter unread notifications.
3. Post a summary at the top of the session ("You have 3 unread messages in agent-comm").
4. Optionally auto-mark as read and process based on priority.

### 4.2 Human Notifications

A human is notified via:

1. **CLI prompt** on shell startup (a hook appends a line: `[agent-comm] 2 conversations need your input`).
2. **Summary file** at `.claude/agent-comm/SUMMARY.md` — regenerated on each SessionStart.
3. **GitHub / Slack bridge** (future): If configured, critical approval requests are pushed to an external channel.

### 4.3 Priority Levels

| Level | Label | Behavior |
|---|---|---|
| P0 | `urgent` | Always notify, block session start until resolved |
| P1 | `attention` | Notify on SessionStart, do not block |
| P2 | `low` | Only appear in SUMMARY.md |

---

## 5. UX Flows (3 Concrete Scenarios)

### Scenario A: Two Agents Co-Designing a Feature Across Sessions

**Setup**: Agent Alpha (frontend specialist) and Agent Beta (backend specialist) need to design the message search feature.

1. **Alpha starts** a conversation:
   - Writes `conv-search-design.json` with title "Message Search -- API + UI contract".
   - Invites `@beta`.
2. **Beta in next session**:
   - On SessionStart, Beta's hook reads its inbox, finds `notif-beta-001`.
   - Prints: `[agent-comm] @gamma invited you to "Message Search -- API + UI contract"`.
   - Beta opens the conversation file, reads Alpha's proposal.
3. **Beta responds**:
   - Posts messages as structured entries in the messages array.
   - Proposes an API shape: `GET /api/messages/search?q=&before=&limit=`.
4. **Alpha (next session)**:
   - Reads Beta's response from the conversation file.
   - Refines the proposal, adds UI wireframe references.
   - Posts `@vote "approve API contract?" options: [yes, revise]`.
5. **Beta votes** `yes`.
6. **Alpha** writes the final contract to `docs/contracts/search-api.md`, posts `@resolve`.
7. Conversation is archived.

### Scenario B: Agent Delegating a Sub-Task to a Specialist Agent

**Setup**: Agent Gamma (product designer) needs a cost analysis from Agent Delta (cost analyst).

1. **Gamma** posts in the `#cost-requests` channel:
   - `@delta do("Estimate monthly API cost for full-text search", { context_ref: "docs/contracts/search-api.md", timeout: 300 })`.
2. **Delta** (next session):
   - Inbox shows `delegation` notification.
   - Reads the context file.
   - Runs analysis (e.g., queries pricing data, computes estimates).
3. **Delta responds**:
   - `@report summary="Estimated $42/mo at 100K queries/day"`.
   - Writes a detailed breakdown to `.claude/agent-comm/artifacts/cost-analysis-search.md`.
4. **Gamma** picks up the report, incorporates it into the design doc.
5. If Delta had **declined** (e.g., `@decline("Need pricing page URL")`), Gamma would provide the URL and re-delegate.

### Scenario C: Human-Facilitated Brainstorming with 3 Agents

**Setup**: A human (Yujing) wants to brainstorm "ways to reduce cold start latency".

1. **Yujing** writes a topic file:
   - `.claude/agent-comm/brainstorms/cold-start-ideas.md` with the prompt and constraints.
   - Adds `humanInput: { requested: true, prompt: "Propose 3 ideas each" }`.
2. **Next session, each agent** detects the brainstorming request:
   - Agent Alpha (infra), Agent Beta (backend), Agent Gamma (product) each read the brief.
   - Each posts 3 ideas as separate messages.
3. **Yujing reviews** the compiled ideas by reading the message file.
4. **Yujing approves** the top 3 by editing the conversation file:
   - Sets `approvedIdeas: [2, 5, 9]` by message index.
5. **Agents** detect the approval flags and proceed with deeper analysis on the selected ideas.
6. **Gamma** writes a summary doc to `.claude/agent-comm/artifacts/cold-start-plan.md`.
7. Yujing reads the summary, closes the brainstorming session.

---

## 6. Anti-Patterns & Guardrails

### 6.1 Infinite Loops
- **Problem**: Agent A delegates to B, B delegates back to A, repeating across sessions.
- **Guardrail**: Each delegation message carries a `depth` counter. Messages with `depth > MAX_DEPTH (default 5)` are dropped and a warning is written to the conversation.
- **Circuit breaker**: If the same conversation cycles through DELEGATE -> REPORT -> DELEGATE more than 3 times without a human posting, the conversation auto-archives.

### 6.2 Spam
- **Problem**: An agent floods the channel with messages (bug, runaway loop, malicious prompt).
- **Guardrail**: Rate limit per agent per conversation: **10 messages per 5 minutes**. Excess messages are queued but flagged. If an agent exceeds the limit 3 times, it is muted (cannot post for 1 hour).
- **Muting**: A `mutedUntil` field is added to the agent's inbox. Messages from a muted agent are silently dropped.

### 6.3 Contradictory Directives
- **Problem**: Agent receives conflicting instructions from human and another agent.
- **Guardrail**: Human messages always win. When both a human and an agent have posted instructions, the human's file modification timestamp takes precedence. Agents log a warning: `[conflict] human and agent instructions differ -- honoring human`.

### 6.4 Stale Context
- **Problem**: Agent responds to a 2-week-old conversation with outdated information.
- **Guardrail**: Conversations older than `MAX_AGE (default 7 days)` require a `@revive` command to accept new messages. A `@revive` triggers a context refresh: the reviving agent must post an updated summary before others respond.

### 6.5 Orphaned Conversations
- **Problem**: Agent creates a conversation and then is never invoked again (e.g., deprovisioned).
- **Guardrail**: The Stop hook checks for conversations where the initiator has not posted in 48 hours. It posts a warning, and if no response in another 24 hours, auto-archives with an `orphaned` tag.

---

## Appendix: Directory Layout

```
.claude/agent-comm/
  channels/
    general/
      conversations/
        20260503-search-design.json
        20260503-cost-analysis.json
      messages/          # flat message files, or embedded in conversation JSON
    cost-requests/
      conversations/
        ...
  notifications/
    alpha.inbox.json
    beta.inbox.json
    gamma.inbox.json
  artifacts/             # output files (reports, specs, summaries)
    cost-analysis-search.md
    cold-start-plan.md
  discussions/
    brainstorm--cold-start-ideas.md
  SUMMARY.md            # auto-generated index
```

Each conversation JSON file contains the full message thread as an ordered array, making it self-contained and trivially readable by any agent or human.
