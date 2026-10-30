/**
 * MindOS In-Memory Outcomes Repository
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import { IOutcomeRepository } from './interfaces.js';
import {
  OutcomeMeasurement,
  OutcomeBaseline,
  OutcomeReview,
  OutcomeAlert,
  OutcomeSnapshot
} from '../domain/entities.js';
import { OutcomeMeasurementValidity } from '../domain/types.js';

export class InMemoryOutcomeRepository implements IOutcomeRepository {
  private measurements: Map<string, OutcomeMeasurement> = new Map();
  private baselines: Map<string, OutcomeBaseline[]> = new Map(); // append-only history by `${userId}:${measureCode}`
  private reviews: Map<string, OutcomeReview> = new Map();
  private alerts: Map<string, OutcomeAlert> = new Map();
  private snapshots: Map<string, OutcomeSnapshot> = new Map();

  public async saveMeasurement(measurement: OutcomeMeasurement): Promise<void> {
    this.measurements.set(measurement.id, { ...measurement });
  }

  public async findMeasurementById(id: string): Promise<OutcomeMeasurement | null> {
    const m = this.measurements.get(id);
    return m ? { ...m } : null;
  }

  public async findMeasurementBySource(sourceType: string, sourceReference: string): Promise<OutcomeMeasurement | null> {
    for (const m of this.measurements.values()) {
      if (m.source_type === sourceType && m.source_reference === sourceReference) {
        return { ...m };
      }
    }
    return null;
  }

  public async findMeasurementsByUserAndMeasure(
    userId: string,
    measureCode: string,
    includeInvalidated = false
  ): Promise<OutcomeMeasurement[]> {
    const list: OutcomeMeasurement[] = [];
    for (const m of this.measurements.values()) {
      if (m.subject_user_id === userId && m.measure_code === measureCode) {
        if (!includeInvalidated && m.validity_status === OutcomeMeasurementValidity.INVALIDATED) {
          continue;
        }
        list.push({ ...m });
      }
    }
    // Sort deterministically by measured_at ASC
    list.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    return list;
  }

  public async findMeasurementsByUser(userId: string, includeInvalidated = false): Promise<OutcomeMeasurement[]> {
    const list: OutcomeMeasurement[] = [];
    for (const m of this.measurements.values()) {
      if (m.subject_user_id === userId) {
        if (!includeInvalidated && m.validity_status === OutcomeMeasurementValidity.INVALIDATED) {
          continue;
        }
        list.push({ ...m });
      }
    }
    list.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    return list;
  }

  public async invalidateMeasurement(id: string, reason: string): Promise<boolean> {
    const m = this.measurements.get(id);
    if (!m) return false;
    m.validity_status = OutcomeMeasurementValidity.INVALIDATED;
    m.invalidation_reason = reason;
    m.invalidated_at = new Date().toISOString();
    this.measurements.set(id, m);
    return true;
  }

  public async invalidateMeasurementBySource(
    sourceType: string,
    sourceReference: string,
    reason: string
  ): Promise<boolean> {
    let found = false;
    for (const [id, m] of this.measurements.entries()) {
      if (m.source_type === sourceType && m.source_reference === sourceReference) {
        m.validity_status = OutcomeMeasurementValidity.INVALIDATED;
        m.invalidation_reason = reason;
        m.invalidated_at = new Date().toISOString();
        this.measurements.set(id, m);
        found = true;
      }
    }
    return found;
  }

  public async saveBaseline(baseline: OutcomeBaseline): Promise<void> {
    const key = `${baseline.subject_user_id}:${baseline.measure_code}`;
    const history=this.baselines.get(key)||[];
    if(!history.some(b=>b.id===baseline.id)) history.push(structuredClone(baseline));
    history.sort((a,b)=>a.established_at.localeCompare(b.established_at)||a.id.localeCompare(b.id));
    this.baselines.set(key,history);
  }

  public async findBaseline(userId: string, measureCode: string): Promise<OutcomeBaseline | null> {
    const key = `${userId}:${measureCode}`;
    const history=this.baselines.get(key)||[];
    const b=history[history.length-1];
    return b ? structuredClone(b) : null;
  }

  public async saveReview(review: OutcomeReview): Promise<void> {
    this.reviews.set(review.id, { ...review });
  }

  public async findReviewById(id: string): Promise<OutcomeReview | null> {
    const r = this.reviews.get(id);
    return r ? { ...r } : null;
  }

  public async findReviewsByUser(userId: string): Promise<OutcomeReview[]> {
    const list: OutcomeReview[] = [];
    for (const r of this.reviews.values()) {
      if (r.subject_user_id === userId) {
        list.push({ ...r });
      }
    }
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return list;
  }

  public async saveAlert(alert: OutcomeAlert): Promise<void> {
    this.alerts.set(alert.id, { ...alert });
  }

  public async findAlertById(id: string): Promise<OutcomeAlert | null> {
    const a = this.alerts.get(id);
    return a ? { ...a } : null;
  }

  public async findAlertsByUser(userId: string, status?: string): Promise<OutcomeAlert[]> {
    const list: OutcomeAlert[] = [];
    for (const a of this.alerts.values()) {
      if (a.subject_user_id === userId) {
        if (!status || a.status === status) {
          list.push({ ...a });
        }
      }
    }
    list.sort((a, b) => b.generated_at.localeCompare(a.generated_at));
    return list;
  }

  public async saveSnapshot(snapshot: OutcomeSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
  }

  public async findSnapshotById(id: string): Promise<OutcomeSnapshot | null> {
    const s = this.snapshots.get(id);
    return s ? structuredClone(s) : null;
  }

  public clear(): void {
    this.measurements.clear();
    this.baselines.clear();
    this.reviews.clear();
    this.alerts.clear();
    this.snapshots.clear();
  }
}
