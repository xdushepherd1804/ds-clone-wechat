/**
 * T028 — Moments (朋友圈) Integration Test
 *
 * Scenario:
 *   1. A and B become friends
 *   2. A publishes a moment (friends visibility)
 *   3. B views timeline, can see A's moment
 *   4. B likes and comments on A's moment
 *   5. A receives like and comment notifications (verified via data)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthService } from '../../../server-auth/src/auth.service';
import type { AuthDeps } from '../../../server-auth/src/auth.service';
import { createContactService } from '../../../server-contact/src/contact.service';
import { createMomentsService } from '../../../server-moments/src/moments.service';
import {
  makeMockPrisma,
  makeMockRedis,
  InMemorySessionStore,
  TEST_JWT_SECRET,
  resetCounters,
} from './test-helpers';
import type { AuthConfig } from '../../../server-auth/src/auth.service';

const AUTH_CONFIG: AuthConfig = { jwtSecret: TEST_JWT_SECRET, accessExpire: '15m', refreshExpire: '7d' };

describe('Moments Integration', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;
  let auth: ReturnType<typeof createAuthService>;
  let contact: ReturnType<typeof createContactService>;
  let moments: ReturnType<typeof createMomentsService>;

  beforeEach(() => {
    resetCounters();
    prisma = makeMockPrisma();
    redis = makeMockRedis();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    auth = createAuthService({
      prisma: prisma as unknown as AuthDeps['prisma'],
      redis: redis as any,
      config: AUTH_CONFIG,
      sessionStore: new InMemorySessionStore(),
    });

    contact = createContactService({ prisma: prisma as unknown as any, redis: redis as any });

    moments = createMomentsService({ prisma: prisma as unknown as any, redis: redis as any });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Step 1: A and B become friends ─────────────────────────────────────

  describe('step 1 — make friends', () => {
    let userIdA: string;
    let userIdB: string;

    beforeEach(async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });
      userIdA = a.user.id;
      userIdB = b.user.id;
    });

    it('A and B become friends via request → accept', async () => {
      const req = await contact.sendFriendRequest({ fromUid: userIdA, toUid: userIdB });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: userIdB });

      const aContacts = await contact.getContacts(userIdA);
      const bContacts = await contact.getContacts(userIdB);

      expect(aContacts.some((c) => c.contactId === userIdB)).toBe(true);
      expect(bContacts.some((c) => c.contactId === userIdA)).toBe(true);
    });

    it('non-friends cannot see friends-only content', async () => {
      // C is not friends with A
      const c = await auth.register({ username: 'charlie', password: 'pass11111', nickname: 'Charlie' });

      // A publishes a friends-only moment
      const moment = await moments.createMoment({
        userId: userIdA,
        content: 'Secret post',
        visibility: 'friends',
      });

      // C tries to view it — should be denied
      await expect(
        moments.getMomentById(moment.id, c.user.id),
      ).rejects.toThrow();
    });
  });

  // ─── Step 2: A publishes a moment (friends visibility) ──────────────────

  describe('step 2 — publish moment', () => {
    let userIdA: string;
    let userIdB: string;

    beforeEach(async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });
      userIdA = a.user.id;
      userIdB = b.user.id;

      const req = await contact.sendFriendRequest({ fromUid: userIdA, toUid: userIdB });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: userIdB });
    });

    it('A publishes a friends-only moment', async () => {
      const moment = await moments.createMoment({
        userId: userIdA,
        content: 'Hello from Alice!',
        visibility: 'friends',
      });

      expect(moment.content).toBe('Hello from Alice!');
      expect(moment.visibility).toBe('friends');
      expect(moment.userId).toBe(userIdA);
      expect(moment.id).toBeTruthy();
    });

    it('A publishes a public moment with images', async () => {
      const moment = await moments.createMoment({
        userId: userIdA,
        content: 'Check out this photo!',
        images: ['/uploads/photo1.jpg', '/uploads/photo2.jpg'],
        visibility: 'public',
        location: 'Beijing',
      });

      expect(moment.visibility).toBe('public');
      expect(moment.images).toHaveLength(2);
      expect(moment.location).toBe('Beijing');
    });

    it('refuses moment with empty content and no images', async () => {
      await expect(
        moments.createMoment({ userId: userIdA, content: '', images: [] }),
      ).rejects.toThrow();
    });

    it('refuses moment with excessive content length', async () => {
      await expect(
        moments.createMoment({ userId: userIdA, content: 'x'.repeat(10001) }),
      ).rejects.toThrow();
    });

    it('A publishes a private moment (only visible to self)', async () => {
      const moment = await moments.createMoment({
        userId: userIdA,
        content: 'Private thoughts',
        visibility: 'private',
      });

      expect(moment.visibility).toBe('private');

      // B should not be able to view it
      await expect(
        moments.getMomentById(moment.id, userIdB),
      ).rejects.toThrow();
    });
  });

  // ─── Step 3: B views timeline, can see A's moment ──────────────────────

  describe('step 3 — view timeline', () => {
    let userIdA: string;
    let userIdB: string;
    let userIdC: string;

    beforeEach(async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });
      const c = await auth.register({ username: 'charlie', password: 'pass11111', nickname: 'Charlie' });
      userIdA = a.user.id;
      userIdB = b.user.id;
      userIdC = c.user.id;

      // A and B are friends
      const req = await contact.sendFriendRequest({ fromUid: userIdA, toUid: userIdB });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: userIdB });
    });

    it('B sees A\'s friends-only moment in timeline', async () => {
      await moments.createMoment({
        userId: userIdA,
        content: 'Friends-only post',
        visibility: 'friends',
      });

      const timeline = await moments.getTimeline({ userId: userIdB });
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline.some((m) => m.content === 'Friends-only post')).toBe(true);
    });

    it('non-friend C does not see A\'s friends-only moment in timeline', async () => {
      await moments.createMoment({
        userId: userIdA,
        content: 'Friends-only post',
        visibility: 'friends',
      });

      const timeline = await moments.getTimeline({ userId: userIdC });
      expect(timeline.some((m) => m.content === 'Friends-only post')).toBe(false);
    });

    it('C can view A\'s public moment via getUserMoments', async () => {
      await moments.createMoment({
        userId: userIdA,
        content: 'Public post',
        visibility: 'public',
      });

      // Non-friends can see public moments on user's profile (but not in timeline)
      const userMoments = await moments.getUserMoments(userIdA, { userId: userIdC });
      expect(userMoments.some((m) => m.content === 'Public post')).toBe(true);
    });

    it('user sees own private moments in timeline', async () => {
      await moments.createMoment({
        userId: userIdA,
        content: 'My private post',
        visibility: 'private',
      });

      const timeline = await moments.getTimeline({ userId: userIdA });
      expect(timeline.some((m) => m.content === 'My private post')).toBe(true);
    });

    it('B sees own moments and friends\' moments in timeline', async () => {
      await moments.createMoment({
        userId: userIdA,
        content: 'A post',
        visibility: 'friends',
      });
      await moments.createMoment({
        userId: userIdB,
        content: 'B post',
        visibility: 'public',
      });

      const timeline = await moments.getTimeline({ userId: userIdB });
      expect(timeline.some((m) => m.content === 'A post')).toBe(true);
      expect(timeline.some((m) => m.content === 'B post')).toBe(true);
    });

    it('getUserMoments returns correct visibility-filtered results', async () => {
      await moments.createMoment({ userId: userIdA, content: 'Public', visibility: 'public' });
      await moments.createMoment({ userId: userIdA, content: 'Friends', visibility: 'friends' });
      await moments.createMoment({ userId: userIdA, content: 'Private', visibility: 'private' });

      // B (friend) sees public + friends
      const bView = await moments.getUserMoments(userIdA, { userId: userIdB });
      expect(bView.filter((m) => m.visibility === 'public' || m.visibility === 'friends')).toHaveLength(2);

      // C (non-friend) sees only public
      const cView = await moments.getUserMoments(userIdA, { userId: userIdC });
      expect(cView.every((m) => m.visibility === 'public')).toBe(true);

      // A sees all three
      const aView = await moments.getUserMoments(userIdA, { userId: userIdA });
      expect(aView).toHaveLength(3);
    });
  });

  // ─── Step 4: B likes and comments on A's moment ────────────────────────

  describe('step 4 — like and comment', () => {
    let userIdA: string;
    let userIdB: string;
    let momentId: string;

    beforeEach(async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });
      userIdA = a.user.id;
      userIdB = b.user.id;

      const req = await contact.sendFriendRequest({ fromUid: userIdA, toUid: userIdB });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: userIdB });

      const moment = await moments.createMoment({
        userId: userIdA,
        content: 'Nice day!',
        visibility: 'friends',
      });
      momentId = moment.id;
    });

    it('B likes A\'s moment', async () => {
      const like = await moments.toggleLikeMoment({ momentId, userId: userIdB });
      expect(like.liked).toBe(true);
    });

    it('B unlikes A\'s moment (toggle)', async () => {
      await moments.toggleLikeMoment({ momentId, userId: userIdB });
      const unlike = await moments.toggleLikeMoment({ momentId, userId: userIdB });
      expect(unlike.liked).toBe(false);
    });

    it('B comments on A\'s moment', async () => {
      const comment = await moments.addComment({
        momentId,
        userId: userIdB,
        content: 'Great photo!',
      });

      expect(comment.content).toBe('Great photo!');
      expect(comment.userId).toBe(userIdB);
      expect(comment.momentId).toBe(momentId);
      expect(comment.id).toBeTruthy();
    });

    it('A replies to B\'s comment', async () => {
      const bComment = await moments.addComment({
        momentId,
        userId: userIdB,
        content: 'Nice!',
      });

      const aReply = await moments.addComment({
        momentId,
        userId: userIdA,
        content: 'Thanks!',
        replyToId: bComment.id,
      });

      expect(aReply.content).toBe('Thanks!');
      expect(aReply.replyToId).toBe(bComment.id);
    });

    it('B can delete own comment', async () => {
      const comment = await moments.addComment({
        momentId,
        userId: userIdB,
        content: 'To be deleted',
      });

      await expect(
        moments.deleteComment({
          momentId,
          commentId: comment.id,
          userId: userIdB,
        }),
      ).resolves.not.toThrow();
    });

    it('A (moment owner) can delete B\'s comment', async () => {
      const comment = await moments.addComment({
        momentId,
        userId: userIdB,
        content: 'Spam comment',
      });

      await expect(
        moments.deleteComment({
          momentId,
          commentId: comment.id,
          userId: userIdA,
        }),
      ).resolves.not.toThrow();
    });

    it('C (non-owner, non-author) cannot delete B\'s comment', async () => {
      const c = await auth.register({ username: 'charlie', password: 'pass11111', nickname: 'Charlie' });

      const comment = await moments.addComment({
        momentId,
        userId: userIdB,
        content: 'Protected comment',
      });

      await expect(
        moments.deleteComment({
          momentId,
          commentId: comment.id,
          userId: c.user.id,
        }),
      ).rejects.toThrow();
    });

    it('getMomentById includes likes and comments', async () => {
      await moments.toggleLikeMoment({ momentId, userId: userIdB });
      await moments.addComment({ momentId, userId: userIdB, content: 'Awesome!' });

      const detail = await moments.getMomentById(momentId, userIdA);
      expect(detail.likes).toHaveLength(1);
      expect(detail.likes[0].userId).toBe(userIdB);
      expect(detail.comments).toHaveLength(1);
      expect(detail.comments[0].content).toBe('Awesome!');
    });
  });

  // ─── Step 5: Verify notification data ────────────────────────────────────

  describe('step 5 — notification verification', () => {
    it('like and comment data is available for notification generation', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });

      const req = await contact.sendFriendRequest({ fromUid: a.user.id, toUid: b.user.id });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: b.user.id });

      const moment = await moments.createMoment({
        userId: a.user.id,
        content: 'Notification test',
        visibility: 'friends',
      });

      // B likes
      const like = await moments.toggleLikeMoment({ momentId: moment.id, userId: b.user.id });
      expect(like.liked).toBe(true);

      // B comments
      const comment = await moments.addComment({
        momentId: moment.id,
        userId: b.user.id,
        content: 'Notified!',
      });

      // Verify data is correct for notification push
      const detail = await moments.getMomentById(moment.id, a.user.id);
      expect(detail.likeCount).toBe(1);
      expect(detail.commentCount).toBe(1);
      expect(detail.likes[0].userId).toBe(b.user.id);
      expect(detail.comments[0].content).toBe('Notified!');
    });
  });

  // ─── Full moments flow ───────────────────────────────────────────────────

  describe('full moments flow', () => {
    it('complete scenario: friends → post → view → like → comment', async () => {
      // Register users
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });
      const c = await auth.register({ username: 'charlie', password: 'pass11111', nickname: 'Charlie' });

      // Make friends: A↔B
      const reqAB = await contact.sendFriendRequest({ fromUid: a.user.id, toUid: b.user.id });
      await contact.handleFriendRequest({ requestId: reqAB.id, action: 'accept', userId: b.user.id });

      // A publishes friends-only moment
      const moment = await moments.createMoment({
        userId: a.user.id,
        content: 'Integration test moment',
        images: ['/img/sunset.jpg'],
        location: 'Home',
        visibility: 'friends',
      });
      expect(moment.visibility).toBe('friends');

      // B can see it in timeline
      const bTimeline = await moments.getTimeline({ userId: b.user.id });
      expect(bTimeline.some((m) => m.id === moment.id)).toBe(true);

      // C (not friend) cannot see it
      const cTimeline = await moments.getTimeline({ userId: c.user.id });
      expect(cTimeline.some((m) => m.id === moment.id)).toBe(false);

      // B likes
      await moments.toggleLikeMoment({ momentId: moment.id, userId: b.user.id });

      // B comments
      await moments.addComment({ momentId: moment.id, userId: b.user.id, content: 'Beautiful!' });

      // A sees the engagement
      const detail = await moments.getMomentById(moment.id, a.user.id);
      expect(detail.likeCount).toBe(1);
      expect(detail.commentCount).toBe(1);
      expect(detail.likes[0].userId).toBe(b.user.id);
      expect(detail.comments[0].content).toBe('Beautiful!');

      // A deletes the moment
      await moments.deleteMoment({ momentId: moment.id, userId: a.user.id });

      // Moment is gone
      await expect(
        moments.getMomentById(moment.id, a.user.id),
      ).rejects.toThrow();
    });
  });
});
