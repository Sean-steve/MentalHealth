/**
 * MindOS Canonical Audit HTTP Controller
 * Authority: Master Architecture Index Section 14, Volumes III, VIII, X, Appendix M
 * API Contract Catalogue: Admin Audit Endpoints
 */

import { AuditQueryService } from '../../query/audit_query_service.js';
import { AuditRepository } from '../../repositories/audit_repository.js';
import { AuditAccessDeniedError } from '../../domain/errors.js';

export interface HttpRequest {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  actor?: {
    actor_id: string;
    roles: string[];
  };
}

export interface HttpResponse {
  status: number;
  body: Record<string, unknown> | string;
  headers?: Record<string, string>;
}

export class AuditHttpController {
  /**
   * GET /api/v1/admin/audit
   */
  public static async listAuditRecords(req: HttpRequest): Promise<HttpResponse> {
    try {
      const actor = req.actor || {
        actor_id: req.headers?.['x-actor-id'] || 'anonymous',
        roles: (req.headers?.['x-actor-roles'] || '').split(',').map((r) => r.trim()).filter(Boolean)
      };

      const purpose = req.headers?.['x-audit-purpose'] || (req.query?.purpose as string) || '';

      const filter = {
        actor_id: req.query?.actor_id,
        action: req.query?.action,
        resource_type: req.query?.resource_type,
        resource_id: req.query?.resource_id,
        correlation_id: req.query?.correlation_id,
        from_date: req.query?.from_date,
        to_date: req.query?.to_date,
        limit: req.query?.limit ? parseInt(req.query.limit, 10) : 50,
        offset: req.query?.offset ? parseInt(req.query.offset, 10) : 0
      };

      const result = await AuditQueryService.query({
        actor,
        purpose,
        filter
      });

      return {
        status: 200,
        body: {
          success: true,
          data: result.records,
          meta: {
            total: result.total,
            limit: filter.limit,
            offset: filter.offset
          }
        }
      };
    } catch (err) {
      if (err instanceof AuditAccessDeniedError) {
        return {
          status: 403,
          body: { success: false, error: err.message, errorCode: err.errorCode }
        };
      }
      return {
        status: 500,
        body: { success: false, error: (err as Error).message }
      };
    }
  }

  /**
   * GET /api/v1/admin/audit/:id
   */
  public static async getAuditRecordById(req: HttpRequest): Promise<HttpResponse> {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, body: { success: false, error: 'Missing record ID parameter' } };
    }

    const record = await AuditRepository.findById(id);
    if (!record) {
      return { status: 404, body: { success: false, error: 'Audit record not found' } };
    }

    return {
      status: 200,
      body: { success: true, data: record }
    };
  }

  /**
   * POST /api/v1/admin/audit/export
   */
  public static async exportAuditRecords(req: HttpRequest): Promise<HttpResponse> {
    try {
      const actor = req.actor || {
        actor_id: req.headers?.['x-actor-id'] || 'anonymous',
        roles: (req.headers?.['x-actor-roles'] || '').split(',').map((r) => r.trim()).filter(Boolean)
      };

      const body = req.body || {};
      const purpose = (body.purpose as string) || req.headers?.['x-audit-purpose'] || '';
      const format = (body.format as 'JSON' | 'CSV') || 'JSON';

      const exportResult = await AuditQueryService.export({
        actor,
        purpose,
        format,
        filter: (body.filter as Record<string, unknown>) || {}
      });

      return {
        status: 200,
        headers: {
          'content-type': format === 'CSV' ? 'text/csv' : 'application/json',
          'x-audit-checksum': exportResult.checksum
        },
        body: {
          success: true,
          data: exportResult
        }
      };
    } catch (err) {
      if (err instanceof AuditAccessDeniedError) {
        return {
          status: 403,
          body: { success: false, error: err.message, errorCode: err.errorCode }
        };
      }
      return {
        status: 500,
        body: { success: false, error: (err as Error).message }
      };
    }
  }
}
