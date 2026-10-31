import { DatabaseObservability } from '../../platform/database/observability.js';
import { EventMetrics } from '../../platform/events/observability/metrics.js';

export class HardeningObservabilityService{
  static snapshot():Record<string,unknown>{
    const db=DatabaseObservability.getMetrics();
    const events=EventMetrics.getSnapshot();
    return {
      generated_at:new Date().toISOString(),
      privacy_boundary:{
        raw_request_bodies_included:false,
        raw_journal_text_included:false,
        raw_ai_prompts_included:false,
        raw_clinical_notes_included:false,
        secrets_or_tokens_included:false
      },
      database:{
        pool:db.pool,
        queries:{
          total:db.queries.totalExecuted,
          slow:db.queries.slowQueriesCount,
          errors:db.queries.errorsCount,
          average_duration_ms:db.queries.avgDurationMs
        },
        transactions:db.transactions
      },
      events:{
        publish_success:events.outboxPublishSuccessTotal,
        publish_failure:events.outboxPublishFailureTotal,
        consumer_processed:events.consumerProcessedTotal,
        consumer_failure:events.consumerFailureTotal,
        dead_letters:events.deadLetterTotal,
        oldest_pending_age_seconds:events.oldestPendingAgeSeconds
      }
    };
  }
}
