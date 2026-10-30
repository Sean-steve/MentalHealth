/**
 * MindOS Outcomes Repository Interfaces
 * Authority: Master Architecture Index Section 7 & 14, Volumes I, III, XV
 * Sprint 23 Bounded Context
 */

import {
  OutcomeMeasurement,
  OutcomeBaseline,
  OutcomeReview,
  OutcomeAlert,
  OutcomeSnapshot
} from '../domain/entities.js';

export interface IOutcomeRepository {
  saveMeasurement(measurement: OutcomeMeasurement): Promise<void>;
  findMeasurementById(id: string): Promise<OutcomeMeasurement | null>;
  findMeasurementBySource(sourceType: string, sourceReference: string): Promise<OutcomeMeasurement | null>;
  findMeasurementsByUserAndMeasure(userId: string, measureCode: string, includeInvalidated?: boolean): Promise<OutcomeMeasurement[]>;
  findMeasurementsByUser(userId: string, includeInvalidated?: boolean): Promise<OutcomeMeasurement[]>;
  invalidateMeasurement(id: string, reason: string): Promise<boolean>;
  invalidateMeasurementBySource(sourceType: string, sourceReference: string, reason: string): Promise<boolean>;

  saveBaseline(baseline: OutcomeBaseline): Promise<void>;
  findBaseline(userId: string, measureCode: string): Promise<OutcomeBaseline | null>;

  saveReview(review: OutcomeReview): Promise<void>;
  findReviewById(id: string): Promise<OutcomeReview | null>;
  findReviewsByUser(userId: string): Promise<OutcomeReview[]>;

  saveAlert(alert: OutcomeAlert): Promise<void>;
  findAlertById(id: string): Promise<OutcomeAlert | null>;
  findAlertsByUser(userId: string, status?: string): Promise<OutcomeAlert[]>;

  saveSnapshot(snapshot: OutcomeSnapshot): Promise<void>;
  saveCompletedReviewWithSnapshot(review: OutcomeReview, snapshot: OutcomeSnapshot): Promise<void>;
  findSnapshotById(id: string): Promise<OutcomeSnapshot | null>;

  clear(): void;
}
