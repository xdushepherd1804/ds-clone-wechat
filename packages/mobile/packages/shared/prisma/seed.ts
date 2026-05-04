/**
 * 测试数据填充脚本
 *
 * 使用方式:
 *   pnpm --filter @wechat-clone/shared db:seed
 *
 * 前置条件:
 *   DATABASE_URL 已设置，prisma migrate dev 已执行
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test data...\n');

  // ── 清理旧数据 (按依赖顺序) ──────────────────────────────────────────────
  await prisma.momentComment.deleteMany();
  await prisma.momentLike.deleteMany();
  await prisma.moment.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.user.deleteMany();

  // ── 用户 ─────────────────────────────────────────────────────────────────
  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: 'alice',
        passwordHash: '$2b$10$placeholder_hash_alice',
        nickname: 'Alice',
        phone: '13800000001',
        status: 'online',
      },
    }),
    prisma.user.create({
      data: {
        username: 'bob',
        passwordHash: '$2b$10$placeholder_hash_bob',
        nickname: 'Bob',
        phone: '13800000002',
        status: 'offline',
      },
    }),
    prisma.user.create({
      data: {
        username: 'carol',
        passwordHash: '$2b$10$placeholder_hash_carol',
        nickname: 'Carol',
        phone: '13800000003',
        status: 'online',
      },
    }),
    prisma.user.create({
      data: {
        username: 'dave',
        passwordHash: '$2b$10$placeholder_hash_dave',
        nickname: 'Dave',
        phone: '13800000004',
        status: 'offline',
      },
    }),
    prisma.user.create({
      data: {
        username: 'eve',
        passwordHash: '$2b$10$placeholder_hash_eve',
        nickname: 'Eve',
        phone: '13800000005',
        status: 'online',
      },
    }),
  ]);

  const [alice, bob, carol, dave, eve] = users;
  console.log(`✓ Created ${users.length} users`);

  // ── 好友关系 ─────────────────────────────────────────────────────────────
  const contacts = await Promise.all([
    prisma.contact.create({
      data: { userId: alice.id, contactId: bob.id, remark: 'Bobby', tags: ['friend', 'work'] },
    }),
    prisma.contact.create({
      data: { userId: alice.id, contactId: carol.id, remark: 'Carol', tags: ['friend'] },
    }),
    prisma.contact.create({
      data: { userId: bob.id, contactId: alice.id, remark: 'Alice', tags: ['friend'] },
    }),
    prisma.contact.create({
      data: { userId: bob.id, contactId: dave.id, remark: 'Davey', tags: ['friend'] },
    }),
    prisma.contact.create({
      data: { userId: carol.id, contactId: alice.id, remark: 'Alice', tags: ['friend'] },
    }),
  ]);
  console.log(`✓ Created ${contacts.length} contacts`);

  // ── 群组 ─────────────────────────────────────────────────────────────────
  const groups = await Promise.all([
    prisma.group.create({
      data: {
        name: 'WeChat Clone Devs',
        ownerId: alice.id,
        announcement: 'Welcome to the dev team!',
        memberCount: 3,
      },
    }),
    prisma.group.create({
      data: {
        name: 'Weekend Hikers',
        ownerId: bob.id,
        announcement: 'Next hike: Saturday 8AM at trailhead',
        memberCount: 2,
      },
    }),
  ]);
  console.log(`✓ Created ${groups.length} groups`);

  // ── 群成员 ───────────────────────────────────────────────────────────────
  const devGroup = groups[0];
  const hikerGroup = groups[1];

  await Promise.all([
    prisma.groupMember.create({
      data: { groupId: devGroup.id, userId: alice.id, role: 'owner', nicknameInGroup: 'Alice (Admin)' },
    }),
    prisma.groupMember.create({
      data: { groupId: devGroup.id, userId: bob.id, role: 'admin', nicknameInGroup: 'Bob' },
    }),
    prisma.groupMember.create({
      data: { groupId: devGroup.id, userId: carol.id, role: 'member', nicknameInGroup: 'Carol' },
    }),
    prisma.groupMember.create({
      data: { groupId: hikerGroup.id, userId: bob.id, role: 'owner', nicknameInGroup: 'Bob' },
    }),
    prisma.groupMember.create({
      data: { groupId: hikerGroup.id, userId: dave.id, role: 'member', nicknameInGroup: 'Dave' },
    }),
  ]);
  console.log(`✓ Created group members`);

  // ── 朋友圈动态 ───────────────────────────────────────────────────────────
  const moments = await Promise.all([
    prisma.moment.create({
      data: {
        userId: alice.id,
        content: 'Beautiful day for coding! ☀️',
        images: ['https://picsum.photos/seed/1/800/600'],
        location: 'San Francisco, CA',
        visibility: 'public',
      },
    }),
    prisma.moment.create({
      data: {
        userId: bob.id,
        content: 'Just finished a 10K run!',
        images: ['https://picsum.photos/seed/2/800/600'],
        visibility: 'friends',
      },
    }),
    prisma.moment.create({
      data: {
        userId: carol.id,
        content: 'New recipe tried today — turned out great!',
        images: ['https://picsum.photos/seed/3/800/600', 'https://picsum.photos/seed/4/800/600'],
        location: 'Home Kitchen',
        visibility: 'public',
      },
    }),
  ]);
  console.log(`✓ Created ${moments.length} moments`);

  // ── 点赞 ─────────────────────────────────────────────────────────────────
  const likes = await Promise.all([
    prisma.momentLike.create({ data: { momentId: moments[0].id, userId: bob.id } }),
    prisma.momentLike.create({ data: { momentId: moments[0].id, userId: carol.id } }),
    prisma.momentLike.create({ data: { momentId: moments[1].id, userId: alice.id } }),
    prisma.momentLike.create({ data: { momentId: moments[2].id, userId: alice.id } }),
    prisma.momentLike.create({ data: { momentId: moments[2].id, userId: bob.id } }),
  ]);
  console.log(`✓ Created ${likes.length} likes`);

  // ── 评论 ─────────────────────────────────────────────────────────────────
  const comments = await Promise.all([
    prisma.momentComment.create({
      data: { momentId: moments[0].id, userId: bob.id, content: 'Nice weather indeed!' },
    }),
    prisma.momentComment.create({
      data: { momentId: moments[0].id, userId: carol.id, content: 'Wish I was there!', replyToId: null },
    }),
    prisma.momentComment.create({
      data: { momentId: moments[1].id, userId: alice.id, content: 'Congrats! 🎉' },
    }),
    prisma.momentComment.create({
      data: { momentId: moments[2].id, userId: dave.id, content: 'Looks delicious!' },
    }),
  ]);
  console.log(`✓ Created ${comments.length} comments`);

  // ── 统计 ─────────────────────────────────────────────────────────────────
  const counts = {
    users: await prisma.user.count(),
    contacts: await prisma.contact.count(),
    groups: await prisma.group.count(),
    groupMembers: await prisma.groupMember.count(),
    moments: await prisma.moment.count(),
    momentLikes: await prisma.momentLike.count(),
    momentComments: await prisma.momentComment.count(),
  };

  console.log('\n📊 Seed summary:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\n✅ Seed completed successfully');
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
