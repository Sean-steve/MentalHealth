/**
 * MindOS Users Bounded Context
 * Authority: Volumes I, III & Appendix B / ADR-005 (Truth-layer separation)
 * Owns: user_profiles, mental_state_observations
 * Must NOT own: Clinical records, formal diagnosis
 */

import { generateUUIDv7 } from '../platform/database/uuid.js';
import { DataClassification } from '../platform/shared/data_classification.js';
import { AuditService } from '../platform/audit/index.js';

export type TruthSourceType =
  | 'USER_REPORTED'
  | 'SYSTEM_OBSERVED'
  | 'AI_INFERRED'
  | 'PROFESSIONAL_ASSESSED'
  | 'CLINICAL_RECORDED';

export interface UserProfileEntity {
  user_id: string; // FK users.id
  display_name?: string;
  country_code: string; // 'KE'
  region_code?: string;
  locale: string;
  timezone: string;
  accessibility_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MentalStateObservationEntity {
  id: string; // UUIDv7
  user_id: string;
  dimension: string; // 'mood' | 'stress' | 'sleep' | 'energy'
  value_json: Record<string, unknown>;
  source_type: TruthSourceType;
  source_ref?: string;
  confidence?: number;
  observed_at: string;
  created_at: string;
}

export class UserService {
  private static profiles: Map<string, UserProfileEntity> = new Map();
  private static observations: Map<string, MentalStateObservationEntity> = new Map();

  public static async createProfile(params: {
    userId: string;
    displayName?: string;
    countryCode?: string;
    locale?: string;
    timezone?: string;
    accessibility?: Record<string, unknown>;
  }): Promise<UserProfileEntity> {
    const now = new Date().toISOString();
    const profile: UserProfileEntity = {
      user_id: params.userId,
      display_name: params.displayName,
      country_code: params.countryCode || 'KE',
      locale: params.locale || 'en-KE',
      timezone: params.timezone || 'Africa/Nairobi',
      accessibility_json: params.accessibility || {},
      created_at: now,
      updated_at: now
    };

    UserService.profiles.set(params.userId, profile);
    return profile;
  }

  /**
   * Records a longitudinal mental state observation with explicit provenance layer
   * ADR-005: Truth-layer separation
   */
  public static async recordObservation(params: {
    userId: string;
    dimension: string;
    value: Record<string, unknown>;
    sourceType: TruthSourceType;
    sourceRef?: string;
    confidence?: number;
    observedAt?: string;
  }): Promise<MentalStateObservationEntity> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    const observation: MentalStateObservationEntity = {
      id,
      user_id: params.userId,
      dimension: params.dimension,
      value_json: params.value,
      source_type: params.sourceType,
      source_ref: params.sourceRef,
      confidence: params.confidence,
      observed_at: params.observedAt || now,
      created_at: now
    };

    UserService.observations.set(id, observation);
    return observation;
  }

  public static getProfile(userId: string): UserProfileEntity | undefined {
    return UserService.profiles.get(userId);
  }

  public static resetForTesting(): void {
    UserService.profiles.clear();
    UserService.observations.clear();
  }
}
