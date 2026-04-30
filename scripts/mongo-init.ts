/**
 * MongoDB Index Creation Script
 *
 * Creates all required indexes for the WeChat Clone MongoDB collections.
 * Safe to re-run: creates indexes with { background: true } (default in mongo 4.2+).
 *
 * Usage:
 *   npx tsx scripts/mongo-init.ts
 */
import { MongoClient } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://wechat:wechat_dev@localhost:27017/wechat?authSource=admin';
const DB_NAME = 'wechat';

interface IndexDefinition {
  spec: Record<string, 1 | -1>;
  options: Record<string, unknown>;
}

const indexes: Record<string, IndexDefinition[]> = {
  messages: [
    { spec: { msg_id: 1 }, options: { unique: true, name: 'idx_messages_msg_id' } },
    { spec: { from_uid: 1, to_uid: 1, created_at: -1 }, options: { name: 'idx_messages_private_timeline' } },
    { spec: { to_group_id: 1, created_at: -1 }, options: { name: 'idx_messages_group_timeline' } },
    { spec: { msg_id: 1, status: 1 }, options: { name: 'idx_messages_status' } },
  ],
  message_boxes: [
    { spec: { user_id: 1, created_at: -1 }, options: { name: 'idx_message_boxes_user_timeline' } },
    { spec: { conversation_id: 1, created_at: -1 }, options: { name: 'idx_message_boxes_conversation' } },
    { spec: { user_id: 1, conversation_id: 1, is_read: 1 }, options: { name: 'idx_message_boxes_unread' } },
    { spec: { user_id: 1, msg_id: 1 }, options: { unique: true, name: 'idx_message_boxes_user_msg' } },
  ],
};

async function main() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`Connected to MongoDB: ${DB_NAME}\n`);

    for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
      const collection = db.collection(collectionName);

      // Create collection explicitly (no-op if exists)
      try {
        await db.createCollection(collectionName);
      } catch {
        // collection already exists
      }

      console.log(`  Creating indexes for '${collectionName}'...`);
      for (const { spec, options } of collectionIndexes) {
        await collection.createIndex(spec, options);
        console.log(`    ✓ ${options.name}`);
      }
    }

    console.log('\nAll MongoDB indexes created successfully.\n');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('MongoDB init error:', err);
  process.exit(1);
});
