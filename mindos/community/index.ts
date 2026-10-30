/**
 * MindOS Community Bounded Context
 * Authority: Volumes I, III & Appendix B / C / Q
 * Owns: community_groups, community_memberships, community_posts, moderation_cases
 * State machines: CommunityMembershipState, ModerationCaseState
 */

import { CommunityMembershipState, ModerationCaseState, validateStateTransition } from '../platform/shared/state_machines.js';
import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { EventBus } from '../platform/events/index.js';
import { AuditService } from '../platform/audit/index.js';
import { AuthorizationError, ValidationError } from '../platform/errors/index.js';
import { SafetyKernel } from '../safety/index.js';

export interface CommunityPostEntity {
  id: string; // UUIDv7
  group_id: string;
  author_id: string;
  content: string;
  is_hidden: boolean;
  moderation_case_id?: string;
  created_at: string;
}

export class CommunityService {
  private static posts: Map<string, CommunityPostEntity> = new Map();
  private static memberships: Map<string, CommunityMembershipState> = new Map();

  public static async createPost(params: {
    groupId: string;
    authorId: string;
    content: string;
  }): Promise<CommunityPostEntity> {
    const memberKey = `${params.groupId}_${params.authorId}`;
    const state = CommunityService.memberships.get(memberKey) || CommunityMembershipState.ACTIVE;

    if (state === CommunityMembershipState.MUTED || state === CommunityMembershipState.BANNED) {
      throw new AuthorizationError('Member is muted or banned from publishing in this community.', {
        errorCode: 'AUTHZ_003'
      });
    }

    const id = generateUUIDv7();
    const isCrisis = /suicide|end my life|kill myself/i.test(params.content);

    let moderationCaseId: string | undefined;
    if (isCrisis) {
      moderationCaseId = generateUUIDv7();
      // Immediately evaluate risk signal via safety kernel
      SafetyKernel.evaluateRiskSignal({
        userId: params.authorId,
        sourceDomain: 'COMMUNITY',
        riskCategory: 'SUICIDE_SELF_HARM',
        signals: { post_id: id, trigger: 'crisis_keyword' }
      });
    }

    const post: CommunityPostEntity = {
      id,
      group_id: params.groupId,
      author_id: params.authorId,
      content: params.content,
      is_hidden: isCrisis,
      moderation_case_id: moderationCaseId,
      created_at: new Date().toISOString()
    };

    CommunityService.posts.set(id, post);

    EventBus.enqueue(
      'community.post_published',
      'community',
      id,
      DataClassification.SENSITIVE,
      {
        post_id: id,
        group_id: params.groupId,
        is_flagged: isCrisis
      }
    );

    return post;
  }

  public static resetForTesting(): void {
    CommunityService.posts.clear();
    CommunityService.memberships.clear();
  }
}
