import { ErrorCode, isValidMsgContent, generateId } from '@wechat-clone/shared';
import { RedisKeys } from '@wechat-clone/shared/db/redis-keys';
export class MessageError extends Error {
    name = 'MessageError';
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
// ─── Helpers ───────────────────────────────────────────────────────────────
function msgCollection(db) {
    return db.collection('messages');
}
function msgBoxCollection(db) {
    return db.collection('message_boxes');
}
function buildConversationId(uid1, uid2) {
    const [a, b] = uid1 < uid2 ? [uid1, uid2] : [uid2, uid1];
    return `conv:${a}:${b}`;
}
function buildGroupConversationId(groupId) {
    return `conv:group:${groupId}`;
}
function parseConversationId(convId) {
    if (convId.startsWith('conv:group:')) {
        return { type: 'group', targetId: convId.slice('conv:group:'.length) };
    }
    const parts = convId.split(':');
    if (parts.length === 3 && parts[0] === 'conv') {
        return { type: 'private', participants: [parts[1], parts[2]] };
    }
    throw new MessageError(ErrorCode.INVALID_PARAM, '无效的会话ID');
}
function mapDocToMessage(doc) {
    return {
        msgId: doc.msgId,
        fromUid: doc.fromUid,
        toUid: doc.toUid ?? undefined,
        toGroupId: doc.toGroupId ?? undefined,
        chatType: doc.chatType,
        msgType: doc.msgType,
        content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content),
        status: doc.status,
        clientSeq: doc.clientSeq,
        serverSeq: doc.serverSeq ?? 0,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
    };
}
// ─── Service Factory ────────────────────────────────────────────────────────
export function createMessageService(deps) {
    const { prisma, mongo, redis = null } = deps;
    let seqCounter = 0;
    const nextSeq = () => ++seqCounter;
    // ─── Helpers ──────────────────────────────────────────────────────────────
    async function getSenderNickname(senderId) {
        try {
            const user = await prisma.user.findUnique({
                where: { id: senderId },
                select: { nickname: true },
            });
            return user?.nickname || '';
        }
        catch {
            return '';
        }
    }
    // ─── Redis cache helpers ─────────────────────────────────────────────────
    const CONV_CACHE_TTL = 300;
    function convCacheKey(userId) {
        return `wc:conv:cache:${userId}`;
    }
    async function cacheConversations(userId, conversations) {
        if (!redis)
            return;
        try {
            await redis.setex(convCacheKey(userId), CONV_CACHE_TTL, JSON.stringify(conversations));
        }
        catch { /* ignore */ }
    }
    async function getCachedConversations(userId) {
        if (!redis)
            return null;
        try {
            const raw = await redis.get(convCacheKey(userId));
            if (raw)
                return JSON.parse(raw);
        }
        catch { /* ignore */ }
        return null;
    }
    async function invalidateConvCache(userId) {
        if (!redis)
            return;
        try {
            await redis.del(convCacheKey(userId));
        }
        catch { /* ignore */ }
    }
    // ─── Send Message ────────────────────────────────────────────────────────
    async function sendMessage(input) {
        if (!isValidMsgContent(input.content)) {
            throw new MessageError(ErrorCode.INVALID_PARAM, '消息内容无效');
        }
        if (input.chatType === 'private' && !input.toUid) {
            throw new MessageError(ErrorCode.INVALID_PARAM, '私聊需要指定接收者');
        }
        if (input.chatType === 'group' && !input.toGroupId) {
            throw new MessageError(ErrorCode.INVALID_PARAM, '群聊需要指定群组');
        }
        // Verify recipient/group exists
        if (input.chatType === 'private') {
            const recipient = await prisma.user.findUnique({ where: { id: input.toUid } });
            if (!recipient) {
                throw new MessageError(ErrorCode.NOT_FOUND, '接收者不存在');
            }
        }
        else {
            const group = await prisma.group.findUnique({ where: { id: input.toGroupId } });
            if (!group) {
                throw new MessageError(ErrorCode.NOT_FOUND, '群组不存在');
            }
            const membership = await prisma.groupMember.findUnique({
                where: { groupId_userId: { groupId: input.toGroupId, userId: input.fromUid } },
            });
            if (!membership) {
                throw new MessageError(ErrorCode.GROUP_PERMISSION_DENIED, '你不是该群成员');
            }
        }
        const now = new Date();
        const convId = input.chatType === 'private'
            ? buildConversationId(input.fromUid, input.toUid)
            : buildGroupConversationId(input.toGroupId);
        const msg = {
            msgId: generateId(),
            fromUid: input.fromUid,
            toUid: input.toUid ?? undefined,
            toGroupId: input.toGroupId ?? undefined,
            chatType: input.chatType,
            msgType: input.msgType,
            content: input.content,
            status: 'sent',
            serverSeq: nextSeq(),
            createdAt: now.toISOString(),
        };
        if (mongo) {
            await msgCollection(mongo).insertOne(msg);
            // Determine recipients for message boxes
            const recipients = [];
            if (input.chatType === 'private') {
                recipients.push(input.fromUid, input.toUid);
            }
            else {
                const members = await prisma.groupMember.findMany({
                    where: { groupId: input.toGroupId },
                    select: { userId: true },
                });
                recipients.push(...members.map((m) => m.userId));
            }
            // Write to message_boxes for each recipient
            const boxEntries = recipients.map((uid) => ({
                msgId: msg.msgId,
                userId: uid,
                conversationId: convId,
                isRead: uid === input.fromUid,
                createdAt: now,
            }));
            await msgBoxCollection(mongo).insertMany(boxEntries);
            // Redis: offline queue for offline recipients, update recent contacts, invalidate cache
            if (redis) {
                for (const uid of recipients) {
                    if (uid === input.fromUid)
                        continue;
                    try {
                        const isOnline = await redis.get(RedisKeys.userOnline(uid));
                        if (isOnline !== '1') {
                            await redis.rpush(RedisKeys.offlineMessages(uid), JSON.stringify(msg));
                            // Trigger push notification for offline user
                            if (deps.onOfflineMessage) {
                                const senderName = await getSenderNickname(input.fromUid);
                                await Promise.resolve(deps.onOfflineMessage({
                                    msg,
                                    recipientId: uid,
                                    senderNickname: senderName,
                                }));
                            }
                        }
                    }
                    catch { /* ignore */ }
                }
                for (const uid of recipients) {
                    try {
                        await redis.zadd(RedisKeys.recentContacts(uid), now.getTime(), convId);
                        await invalidateConvCache(uid);
                    }
                    catch { /* ignore */ }
                }
            }
        }
        return msg;
    }
    // ─── Get Messages (history) ──────────────────────────────────────────────
    async function getMessages(conversationId, userId, options) {
        if (!mongo)
            return [];
        const limit = Math.min(options?.limit ?? 50, 100);
        const filter = { userId, conversationId };
        if (options?.before) {
            filter.createdAt = { $lt: new Date(options.before) };
        }
        const boxes = await msgBoxCollection(mongo)
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
        if (boxes.length === 0)
            return [];
        const msgIds = boxes.map((b) => b.msgId);
        const msgs = await msgCollection(mongo)
            .find({ msgId: { $in: msgIds } })
            .toArray();
        const msgMap = new Map();
        for (const m of msgs) {
            msgMap.set(m.msgId, m);
        }
        return boxes
            .map((box) => {
            const msg = msgMap.get(box.msgId);
            return msg ? mapDocToMessage(msg) : null;
        })
            .filter((m) => m !== null);
    }
    // ─── Get Conversations ───────────────────────────────────────────────────
    async function getConversations(userId, options) {
        if (!mongo)
            return [];
        const limit = Math.min(options?.limit ?? 20, 100);
        const offset = options?.offset ?? 0;
        // Try Redis cache
        const cached = await getCachedConversations(userId);
        if (cached) {
            return cached.slice(offset, offset + limit);
        }
        // Aggregate message_boxes to build conversation list
        const pipeline = [
            { $match: { userId } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$conversationId',
                    lastMsgTime: { $max: '$createdAt' },
                    unreadCount: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
                    lastMsgId: { $first: '$msgId' },
                },
            },
            { $sort: { lastMsgTime: -1 } },
            { $skip: offset },
            { $limit: limit },
        ];
        const results = await msgBoxCollection(mongo).aggregate(pipeline).toArray();
        const lastMsgIds = results.map((r) => r.lastMsgId).filter(Boolean);
        const msgs = lastMsgIds.length > 0
            ? await msgCollection(mongo).find({ msgId: { $in: lastMsgIds } }).toArray()
            : [];
        const msgMap = new Map();
        for (const m of msgs) {
            msgMap.set(m.msgId, m);
        }
        const conversations = [];
        for (const r of results) {
            const convId = r._id;
            let chatType = 'private';
            let targetId = '';
            try {
                const parsed = parseConversationId(convId);
                chatType = parsed.type;
                targetId = parsed.type === 'group'
                    ? (parsed.targetId ?? '')
                    : (parsed.participants?.find((p) => p !== userId) ?? '');
            }
            catch {
                // If parsing fails, keep defaults
            }
            const lastMsg = msgMap.get(r.lastMsgId);
            conversations.push({
                conversationId: convId,
                chatType,
                targetId,
                lastMsg: lastMsg ? mapDocToMessage(lastMsg) : null,
                unreadCount: r.unreadCount ?? 0,
                isTop: false,
                isMuted: false,
                updatedAt: r.lastMsgTime instanceof Date ? r.lastMsgTime.toISOString() : String(r.lastMsgTime),
            });
        }
        // Cache result
        await cacheConversations(userId, conversations);
        return conversations;
    }
    // ─── Mark Conversation Read ──────────────────────────────────────────────
    async function markConversationRead(conversationId, userId) {
        if (!mongo) {
            throw new MessageError(ErrorCode.CONVERSATION_NOT_FOUND, '数据库不可用');
        }
        const result = await msgBoxCollection(mongo).updateMany({ userId, conversationId, isRead: false }, { $set: { isRead: true } });
        await invalidateConvCache(userId);
        return { updatedCount: result.modifiedCount };
    }
    // ─── Recall Message ──────────────────────────────────────────────────────
    async function recallMessage(input) {
        if (!mongo) {
            throw new MessageError(ErrorCode.MSG_NOT_FOUND, '消息不存在');
        }
        const msg = await msgCollection(mongo).findOne({ msgId: input.msgId });
        if (!msg) {
            throw new MessageError(ErrorCode.MSG_NOT_FOUND, '消息不存在');
        }
        if (msg.fromUid !== input.userId) {
            throw new MessageError(ErrorCode.FORBIDDEN, '只能撤回自己的消息');
        }
        const twoMinutes = 2 * 60 * 1000;
        const msgTime = new Date(msg.createdAt).getTime();
        if (Date.now() - msgTime > twoMinutes) {
            throw new MessageError(ErrorCode.INVALID_PARAM, '超过2分钟的消息无法撤回');
        }
        await msgCollection(mongo).updateOne({ msgId: input.msgId }, { $set: { status: 'recalled' } });
        return { ...msg, status: 'recalled' };
    }
    // ─── Get Offline Messages ────────────────────────────────────────────────
    async function getOfflineMessages(userId) {
        if (!redis)
            return [];
        const messages = [];
        try {
            const key = RedisKeys.offlineMessages(userId);
            while (true) {
                const raw = await redis.lpop(key);
                if (!raw)
                    break;
                try {
                    messages.push(JSON.parse(raw));
                }
                catch {
                    // Skip corrupted entries
                }
            }
        }
        catch {
            // Redis error
        }
        return messages;
    }
    return {
        sendMessage,
        getMessages,
        getConversations,
        markConversationRead,
        recallMessage,
        getOfflineMessages,
    };
}
//# sourceMappingURL=message.service.js.map