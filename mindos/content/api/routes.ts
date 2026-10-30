/**
 * MindOS Canonical Content & Psychoeducation HTTP Routes
 * Authority: Master Architecture Index Section 8, Volumes I, III, XVI & Appendix B / Q
 */

import { Router, Request, Response } from 'express';
import { ContentApplicationService } from '../application/service.ts';
import { formatErrorResponse } from '../../platform/errors/index.js';

export const contentRouter = Router();

// Ensure initialization
ContentApplicationService.initialize();

/**
 * Helper to resolve subject user ID from auth context or fallback.
 */
function getSubjectUserId(req: Request): string {
  const user = (req as unknown as { user?: { id?: string; sub?: string } }).user;
  return user?.id || user?.sub || (req.headers['x-user-id'] as string) || 'anon-user-ke';
}

/**
 * GET /api/content/search
 * Search and discover published psychoeducational content.
 */
contentRouter.get('/search', (req: Request, res: Response) => {
  try {
    const { q, topic, type, audience, jurisdiction } = req.query;
    const userId = getSubjectUserId(req);

    const results = ContentApplicationService.searchContent({
      query: q ? String(q) : undefined,
      topic: topic ? String(topic) : undefined,
      contentType: type as any,
      audience: audience as any,
      jurisdiction: jurisdiction ? String(jurisdiction) : undefined,
      userId
    });

    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/item/:idOrCode
 * Retrieve full content detail, structured blocks, claims, and active exercise.
 */
contentRouter.get('/item/:idOrCode', (req: Request, res: Response) => {
  try {
    const { idOrCode } = req.params;
    const userId = getSubjectUserId(req);
    const detail = ContentApplicationService.getContentDetail(idOrCode, userId);
    res.json({ success: true, data: detail });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * POST /api/content/item/:id/bookmark
 * Toggle user bookmark on a content definition.
 */
contentRouter.post('/item/:id/bookmark', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getSubjectUserId(req);
    const { bookmarked } = req.body;

    if (bookmarked === false) {
      ContentApplicationService.removeBookmark(userId, id);
    } else {
      ContentApplicationService.bookmarkContent(userId, id);
    }

    res.json({ success: true, bookmarked: bookmarked !== false });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * POST /api/content/item/:id/progress
 * Update user reading/interaction progress.
 */
contentRouter.post('/item/:id/progress', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = getSubjectUserId(req);
    const { percentage, lastPosition } = req.body;

    const progress = ContentApplicationService.recordReadingProgress({
      userId,
      contentDefinitionId: id,
      percentage: Number(percentage) || 0,
      lastPosition: Number(lastPosition) || 0
    });

    res.json({ success: true, data: progress });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * POST /api/content/exercises/sessions/start
 * Begin a guided exercise session.
 */
contentRouter.post('/exercises/sessions/start', async (req: Request, res: Response) => {
  try {
    const userId = getSubjectUserId(req);
    const { exerciseId, userAge, userJurisdiction, contextReference } = req.body;

    const session = await ContentApplicationService.startExerciseSession({
      userId,
      exerciseId,
      userAge: userAge ? Number(userAge) : undefined,
      userJurisdiction: userJurisdiction || 'KE',
      contextReference
    });

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * POST /api/content/exercises/sessions/:sessionId/step
 * Submit an exercise step response.
 */
contentRouter.post('/exercises/sessions/:sessionId/step', async (req: Request, res: Response) => {
  try {
    const userId = getSubjectUserId(req);
    const { sessionId } = req.params;
    const { stepPosition, inputValue, durationSpentSeconds } = req.body;

    const result = await ContentApplicationService.submitExerciseStep({
      sessionId,
      userId,
      stepPosition: Number(stepPosition),
      inputValue,
      durationSpentSeconds: durationSpentSeconds ? Number(durationSpentSeconds) : undefined
    });

    res.json({ success: true, data: result });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * POST /api/content/exercises/sessions/:sessionId/abandon
 * Abandon an active exercise session.
 */
contentRouter.post('/exercises/sessions/:sessionId/abandon', async (req: Request, res: Response) => {
  try {
    const userId = getSubjectUserId(req);
    const { sessionId } = req.params;

    const session = await ContentApplicationService.abandonExerciseSession(sessionId, userId);
    res.json({ success: true, data: session });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/exercises/sessions/:sessionId
 * Fetch an exercise session.
 */
contentRouter.get('/exercises/sessions/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = ContentApplicationService.getExerciseSession(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    }
    res.json({ success: true, data: session });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/collections
 * List all curated content collections and pathways.
 */
contentRouter.get('/collections', (_req: Request, res: Response) => {
  try {
    const collections = ContentApplicationService.listCollections();
    res.json({ success: true, data: collections });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/collections/:idOrCode
 * Fetch a specific collection and its item pathway.
 */
contentRouter.get('/collections/:idOrCode', (req: Request, res: Response) => {
  try {
    const { idOrCode } = req.params;
    const data = ContentApplicationService.getCollection(idOrCode);
    res.json({ success: true, data });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/user/bookmarks
 * List user bookmarked content items.
 */
contentRouter.get('/user/bookmarks', (req: Request, res: Response) => {
  try {
    const userId = getSubjectUserId(req);
    const bookmarks = ContentApplicationService.getUserBookmarks(userId);
    res.json({ success: true, data: bookmarks });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/user/progress
 * List user learning and exercise progress records.
 */
contentRouter.get('/user/progress', (req: Request, res: Response) => {
  try {
    const userId = getSubjectUserId(req);
    const progress = ContentApplicationService.listUserProgress(userId);
    res.json({ success: true, data: progress });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * POST /api/content/issues
 * Report clinical, accessibility, or quality issue against content.
 */
contentRouter.post('/issues', async (req: Request, res: Response) => {
  try {
    const userId = getSubjectUserId(req);
    const { contentVersionId, issueType, severity, description, source } = req.body;

    const issue = await ContentApplicationService.reportIssue({
      contentVersionId,
      issueType,
      severity,
      description,
      reportedBy: userId,
      source
    });

    res.status(201).json({ success: true, data: issue });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});

/**
 * GET /api/content/retrieval/context
 * Governed AI Context Port for RAG.
 */
contentRouter.get('/retrieval/context', (req: Request, res: Response) => {
  try {
    const { q, topic, maxResults } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: { message: 'Query parameter q is required' } });
    }

    const chunks = ContentApplicationService.queryGovernedContext({
      query: String(q),
      topic: topic ? String(topic) : undefined,
      maxResults: maxResults ? Number(maxResults) : 5
    });

    res.json({ success: true, count: chunks.length, data: chunks });
  } catch (err) {
    const { status, envelope } = formatErrorResponse(err);
    res.status(status).json({ success: false, error: envelope });
  }
});
