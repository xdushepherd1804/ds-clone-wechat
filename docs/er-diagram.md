# WeChat Clone — ER Diagram

## PostgreSQL Schema

```mermaid
erDiagram
    users {
        uuid    id             PK
        varchar username       UK
        varchar password_hash
        varchar nickname
        varchar avatar
        varchar phone          UK
        varchar status
        timestamptz last_seen_at
        timestamptz created_at
        timestamptz updated_at
    }

    contacts {
        uuid       id          PK
        uuid       user_id     FK
        uuid       contact_id  FK
        varchar    remark
        varchar[]  tags
        varchar    status
        timestamptz created_at
    }

    groups {
        uuid       id          PK
        varchar    name
        varchar    avatar
        uuid       owner_id    FK
        text       announcement
        int        member_count
        timestamptz created_at
    }

    group_members {
        uuid       id               PK
        uuid       group_id         FK
        uuid       user_id          FK
        varchar    role
        varchar    nickname_in_group
        timestamptz joined_at
    }

    moments {
        uuid       id          PK
        uuid       user_id     FK
        text       content
        varchar[]  images
        varchar    location
        varchar    visibility
        timestamptz created_at
    }

    moment_likes {
        uuid       id          PK
        uuid       moment_id   FK
        uuid       user_id     FK
        timestamptz created_at
    }

    moment_comments {
        uuid       id          PK
        uuid       moment_id   FK
        uuid       user_id     FK
        uuid       reply_to_id FK
        text       content
        timestamptz created_at
    }

    users ||--o{ contacts : "user_id"
    users ||--o{ contacts : "contact_id"
    users ||--o{ groups : "owner_id"
    users ||--o{ group_members : "user_id"
    users ||--o{ moments : "user_id"
    users ||--o{ moment_likes : "user_id"
    users ||--o{ moment_comments : "user_id"

    groups ||--o{ group_members : "group_id"

    moments ||--o{ moment_likes : "moment_id"
    moments ||--o{ moment_comments : "moment_id"

    moment_comments ||--o{ moment_comments : "reply_to_id"
```

## Relationships Summary

| Parent | Child | Type | FK | On Delete |
|--------|-------|------|----|-----------|
| users | contacts | 1:N | user_id, contact_id | CASCADE |
| users | groups | 1:N | owner_id | CASCADE |
| users | group_members | 1:N | user_id | CASCADE |
| groups | group_members | 1:N | group_id | CASCADE |
| users | moments | 1:N | user_id | CASCADE |
| users | moment_likes | 1:N | user_id | CASCADE |
| moments | moment_likes | 1:N | moment_id | CASCADE |
| users | moment_comments | 1:N | user_id | CASCADE |
| moments | moment_comments | 1:N | moment_id | CASCADE |
| moment_comments | moment_comments | self-ref | reply_to_id | SET NULL |

## 3NF Compliance Notes

All tables satisfy Third Normal Form (3NF):

1. **1NF (Atomic)**: All columns contain atomic values. PostgreSQL arrays (`tags`, `images`) are atomic in the relational model — the DB treats them as single values with array operators.

2. **2NF (No partial dependency)**: All tables have UUID single-column primary keys, so no partial dependency is possible.

3. **3NF (No transitive dependency)**: Non-key columns depend only on the primary key:
   - In `moments`, `location` depends on `id`, not on `user_id`
   - In `contacts`, `tags` depends on the contact relationship (`id`), not transitively through `user_id`
   - In `group_members`, `role` depends on the membership itself, not on `user_id` or `group_id` alone

## MongoDB Collection Design

```mermaid
erDiagram
    messages {
        ObjectId _id            PK
        string   msg_id         UK
        string   from_uid
        string   to_uid
        string   to_group_id
        string   msg_type
        string   content
        string   file_url
        string   thumbnail
        string   status
        datetime created_at
        datetime updated_at
    }

    message_boxes {
        ObjectId _id              PK
        string   user_id
        string   msg_id
        string   conversation_id
        bool     is_read
        datetime created_at
    }

    messages ||--o{ message_boxes : "msg_id"
```

## Redis Key Design

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `wc:session:{token}` | STRING | 7d | User session |
| `wc:user:online:{uid}` | STRING | 30s | Online heartbeat |
| `wc:ws:conn:{uid}` | HASH | — | WebSocket connection info |
| `wc:group:members:{gid}` | SET | — | Group member cache |
| `wc:user:profile:{uid}` | HASH | 1h | User profile cache |
| `wc:user:recent:{uid}` | ZSET | — | Recent contacts list |
| `wc:user:offline:{uid}` | LIST | — | Offline message queue |
| `wc:rate:{action}:{id}:{window}` | STRING | window | Rate limiting |
| `wc:lock:{resource}` | STRING | — | Distributed lock |
