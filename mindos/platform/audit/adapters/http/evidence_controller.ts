/**
 * MindOS Canonical Governance Evidence HTTP Controller
 * Authority: Master Architecture Index Section 14, Volumes III, XIV, XV, Appendix B & Q
 * API Contract Catalogue: Governance Evidence Endpoints
 */

import { GovernanceEvidenceService } from '../../application/governance_evidence_service.js';
import { EvidenceQueryService } from '../../query/evidence_query_service.js';
import { PrivateEvidenceStorage } from '../../repositories/storage/private_evidence_storage.js';
import { HttpRequest, HttpResponse } from './audit_controller.js';

export class EvidenceHttpController {
  /**
   * GET /api/v1/governance/evidence
   */
  public static async listEvidence(req: HttpRequest): Promise<HttpResponse> {
    try {
      const filter = {
        evidence_type: req.query?.evidence_type,
        domain: req.query?.domain,
        related_resource_type: req.query?.related_resource_type,
        related_resource_id: req.query?.related_resource_id,
        status: req.query?.status,
        created_by: req.query?.created_by,
        limit: req.query?.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query?.offset ? parseInt(req.query.offset, 10) : 0
      };

      const result = await EvidenceQueryService.query(filter);
      return {
        status: 200,
        body: {
          success: true,
          data: result.evidence,
          meta: {
            total: result.total,
            limit: filter.limit,
            offset: filter.offset
          }
        }
      };
    } catch (err) {
      return {
        status: 500,
        body: { success: false, error: (err as Error).message }
      };
    }
  }

  /**
   * GET /api/v1/governance/evidence/:id
   */
  public static async getEvidenceDetail(req: HttpRequest): Promise<HttpResponse> {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, body: { success: false, error: 'Missing evidence ID parameter' } };
    }

    const detail = await EvidenceQueryService.getDetail(id);
    if (!detail) {
      return { status: 404, body: { success: false, error: 'Evidence record not found' } };
    }

    return {
      status: 200,
      body: { success: true, data: detail }
    };
  }

  /**
   * POST /api/v1/governance/evidence
   */
  public static async createEvidence(req: HttpRequest): Promise<HttpResponse> {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body.title || !body.evidence_type || !body.domain) {
        return { status: 400, body: { success: false, error: 'Missing required evidence attributes' } };
      }

      const created = await GovernanceEvidenceService.createEvidence(
        {
          title: String(body.title),
          description: String(body.description || ''),
          evidence_type: String(body.evidence_type),
          domain: String(body.domain),
          related_resource_type: String(body.related_resource_type || 'FEATURE'),
          related_resource_id: String(body.related_resource_id || 'UNKNOWN'),
          created_by: String(body.created_by || req.actor?.actor_id || 'system'),
          classification: body.classification as string,
          metadata: (body.metadata as Record<string, unknown>) || {}
        },
        body.raw_content as string | Buffer,
        (body.links as any[]) || [],
        (body.attachments as any[]) || []
      );

      return {
        status: 201,
        body: { success: true, data: created }
      };
    } catch (err) {
      return {
        status: 500,
        body: { success: false, error: (err as Error).message }
      };
    }
  }

  /**
   * POST /api/v1/governance/evidence/:id/access-token
   */
  public static async requestSignedAccess(req: HttpRequest): Promise<HttpResponse> {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, body: { success: false, error: 'Missing evidence ID' } };
    }

    const body = req.body || {};
    const requesterId = (body.requester_id as string) || req.actor?.actor_id || 'anonymous';
    const requesterRole = (body.requester_role as string) || req.actor?.roles?.[0] || 'REVIEWER';
    const purpose = (body.purpose as string) || req.headers?.['x-audit-purpose'] || 'Evidence Inspection';

    try {
      const grant = await GovernanceEvidenceService.requestSignedAccess({
        evidenceId: id,
        requesterId,
        requesterRole,
        purpose
      });

      return {
        status: 200,
        body: { success: true, data: grant }
      };
    } catch (err) {
      return {
        status: 500,
        body: { success: false, error: (err as Error).message }
      };
    }
  }

  /**
   * GET /api/v1/governance/evidence/content/:token
   */
  public static async downloadContentByToken(req: HttpRequest): Promise<HttpResponse> {
    const token = req.params?.token;
    if (!token) {
      return { status: 400, body: { success: false, error: 'Missing access token' } };
    }

    try {
      const content = await PrivateEvidenceStorage.getByToken(token);
      return {
        status: 200,
        headers: {
          'content-type': content.mime_type,
          'x-content-hash': content.content_hash
        },
        body: content.content.toString('utf-8')
      };
    } catch (err) {
      return {
        status: 403,
        body: { success: false, error: (err as Error).message }
      };
    }
  }
}
