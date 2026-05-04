/**
 * @wechat-clone/server-moments — moments and timeline service
 */

export { createMomentsService, MomentError } from './moments.service';
export type {
  MomentsServiceDeps,
  CreateMomentInput,
  DeleteMomentInput,
  AddCommentInput,
  DeleteCommentInput,
  LikeMomentInput,
  TimelineQuery,
  ToggleLikeResult,
} from './moments.service';
