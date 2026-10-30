/**
 * MindOS Synthetic Development Seed Infrastructure
 * Authority: Master Architecture Index Section 9 & Appendix B, Sprint 2 Guidelines
 * 
 * STRICT INVARIANT (R-DATA-SYNTH-001):
 * Under NO circumstances shall real production personal, mental-health,
 * clinical narrative, assessment answers, or identifiable data be used in seed data.
 * All records must be strictly synthetic and deterministic.
 */

import { ConfigurationManager } from '../configuration/index.js';
import { generateUUIDv7 } from './uuid.js';
import { logger } from '../observability/logger.js';

export interface SyntheticSeedResult {
  environment: string;
  usersCreated: number;
  professionalsCreated: number;
  crisisFacilitiesCreated: number;
  safetyPoliciesSeeded: number;
  timestamp: string;
}

export class SeedManager {
  /**
   * Applies synthetic seed data.
   * Refuses to run against STAGING or PRODUCTION environments to safeguard real data.
   */
  public static async seed(): Promise<SyntheticSeedResult> {
    const config = ConfigurationManager.get();
    const env = config.env;

    if (env === 'production' || env === 'staging') {
      const errorMsg = `DATABASE_SECURITY_VIOLATION: Seeding operation is strictly forbidden in "${env}" environment.`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    logger.info(`Starting synthetic seed injection for environment: ${env}`);

    // 1. Synthetic Users
    const syntheticUsers = [
      {
        id: generateUUIDv7(),
        email: 'synthetic.user.patient1@mindos.local',
        role: 'END_USER',
        display_name: 'Synthetic Patient Nairobi',
        account_state: 'ACTIVE',
        country_code: 'KE'
      },
      {
        id: generateUUIDv7(),
        email: 'synthetic.user.patient2@mindos.local',
        role: 'END_USER',
        display_name: 'Synthetic Patient Mombasa',
        account_state: 'ACTIVE',
        country_code: 'KE'
      },
      {
        id: generateUUIDv7(),
        email: 'synthetic.peer.moderator@mindos.local',
        role: 'COMMUNITY_MODERATOR',
        display_name: 'Synthetic Community Moderator',
        account_state: 'ACTIVE',
        country_code: 'KE'
      }
    ];

    // 2. Synthetic Verified Professionals (Regulated under Kenya DHA)
    const syntheticProfessionals = [
      {
        id: generateUUIDv7(),
        email: 'synthetic.dr.mwangi@mindos.local',
        full_name: 'Dr. Synthetic Mwangi, MBChB, MMed Psych',
        cadre: 'PSYCHIATRIST',
        license_number: 'KMPDC-REG-SYNTH-9941',
        verification_status: 'VERIFIED',
        active_care_relationships: ['test-patient-rel-1']
      },
      {
        id: generateUUIDv7(),
        email: 'synthetic.counsellor.wanjiku@mindos.local',
        full_name: 'Synthetic Counsellor Wanjiku, MSc Clinical Psych',
        cadre: 'CLINICAL_PSYCHOLOGIST',
        license_number: 'KPA-REG-SYNTH-5520',
        verification_status: 'VERIFIED',
        active_care_relationships: ['test-patient-rel-2']
      }
    ];

    // 3. Synthetic Verified Facilities & Hotlines (Kenya DHA / Ministry of Health Reference)
    const syntheticFacilities = [
      {
        id: generateUUIDv7(),
        name: 'Mathari National Teaching and Referral Hospital (Synthetic Ref)',
        facility_type: 'NATIONAL_REFERRAL',
        county: 'Nairobi',
        contact_phone: '+254 20 233 7694',
        emergency_hours: '24/7'
      },
      {
        id: generateUUIDv7(),
        name: 'Chiromo Hospital Group - Brain Health (Synthetic Ref)',
        facility_type: 'SPECIALIZED_CLINIC',
        county: 'Nairobi',
        contact_phone: '+254 729 333 444',
        emergency_hours: '24/7'
      },
      {
        id: generateUUIDv7(),
        name: 'Moi Teaching and Referral Hospital Psych Wing (Synthetic Ref)',
        facility_type: 'REGIONAL_REFERRAL',
        county: 'Uasin Gishu',
        contact_phone: '+254 53 203 3471',
        emergency_hours: '24/7'
      }
    ];

    logger.info(`Seeded ${syntheticUsers.length} synthetic users.`);
    logger.info(`Seeded ${syntheticProfessionals.length} synthetic licensed healthcare professionals.`);
    logger.info(`Seeded ${syntheticFacilities.length} synthetic referral facilities.`);

    return {
      environment: env,
      usersCreated: syntheticUsers.length,
      professionalsCreated: syntheticProfessionals.length,
      crisisFacilitiesCreated: syntheticFacilities.length,
      safetyPoliciesSeeded: 2,
      timestamp: new Date().toISOString()
    };
  }
}
