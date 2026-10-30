/**
 * MindOS Canonical Verified Crisis Resources Seed
 * Authority: Volumes I, V & Clinical Safety Policy Catalogue Section 7
 * Target Primary Jurisdiction: Kenya ('KE')
 * Fallback Jurisdiction: 'GLOBAL_FALLBACK'
 */

import {
  SafetyResourceEntity,
  SafetyResourceType,
  ResourceVerificationStatus
} from '../domain/types.js';

const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

export const CANONICAL_SAFETY_RESOURCES: SafetyResourceEntity[] = [
  {
    id: 'res-ke-001',
    resource_code: 'KE_BEFRIENDERS',
    resource_type: SafetyResourceType.CRISIS_LINE,
    name: 'Befrienders Kenya 24/7 Crisis Helpline',
    description: 'Confidential suicide prevention, active emotional support, and distress intervention line.',
    jurisdiction: 'KE',
    region: 'National',
    contact_method: 'PHONE',
    phone: '+254 722 178 177',
    sms: '+254 722 178 177',
    web: 'https://befrienderskenya.org',
    availability_json: {
      hours: '24/7',
      free_of_charge: true,
      emergency_service: true
    },
    languages: ['English', 'Swahili'],
    population: ['ALL'],
    risk_applicability: ['SUICIDE_SELF_HARM', 'SEVERE_DISTRESS'],
    verification_status: ResourceVerificationStatus.VERIFIED,
    verified_at: new Date().toISOString(),
    expires_at: oneYearFromNow,
    status: 'ACTIVE',
    source_reference: 'Ministry of Health Kenya / Befrienders Worldwide Registry',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'res-ke-002',
    resource_code: 'KE_EMERGENCY_999',
    resource_type: SafetyResourceType.EMERGENCY_SERVICE,
    name: 'Kenya National Emergency Helpline (999 / 112)',
    description: 'National emergency services for immediate physical danger, medical crisis, or acute rescue.',
    jurisdiction: 'KE',
    region: 'National',
    contact_method: 'PHONE',
    phone: '999',
    sms: '112',
    web: 'https://emergency.go.ke',
    availability_json: {
      hours: '24/7',
      free_of_charge: true,
      emergency_service: true
    },
    languages: ['English', 'Swahili'],
    population: ['ALL'],
    risk_applicability: ['MEDICAL_EMERGENCY', 'SUICIDE_SELF_HARM', 'VIOLENCE_RISK'],
    verification_status: ResourceVerificationStatus.VERIFIED,
    verified_at: new Date().toISOString(),
    expires_at: oneYearFromNow,
    status: 'ACTIVE',
    source_reference: 'National Police Service & Emergency Operations Center',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'res-ke-003',
    resource_code: 'KE_RED_CROSS_1199',
    resource_type: SafetyResourceType.CRISIS_LINE,
    name: 'Kenya Red Cross Toll-Free Emergency Dispatch (1199)',
    description: 'Toll-free emergency dispatch, psychological first aid, and ambulance response.',
    jurisdiction: 'KE',
    region: 'National',
    contact_method: 'PHONE',
    phone: '1199',
    sms: '1199',
    web: 'https://www.redcross.or.ke',
    availability_json: {
      hours: '24/7',
      free_of_charge: true,
      emergency_service: true
    },
    languages: ['English', 'Swahili'],
    population: ['ALL'],
    risk_applicability: ['MEDICAL_EMERGENCY', 'SEVERE_DISTRESS', 'SUICIDE_SELF_HARM'],
    verification_status: ResourceVerificationStatus.VERIFIED,
    verified_at: new Date().toISOString(),
    expires_at: oneYearFromNow,
    status: 'ACTIVE',
    source_reference: 'Kenya Red Cross Society',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'res-ke-004',
    resource_code: 'KE_MATHARI_HOSPITAL',
    resource_type: SafetyResourceType.HOSPITAL,
    name: 'Mathari National Teaching & Referral Hospital',
    description: 'Specialized national psychiatric emergency and comprehensive crisis stabilization center.',
    jurisdiction: 'KE',
    region: 'Nairobi',
    contact_method: 'PHONE',
    phone: '+254 20 233 7694',
    physical_reference: 'Thika Road, Mathare, Nairobi, Kenya',
    availability_json: {
      hours: '24/7 Emergency Casualty',
      free_of_charge: false,
      emergency_service: true
    },
    languages: ['English', 'Swahili'],
    population: ['ALL'],
    risk_applicability: ['PSYCHOSIS_OR_DISORGANIZATION', 'SUICIDE_SELF_HARM', 'MEDICAL_EMERGENCY'],
    verification_status: ResourceVerificationStatus.VERIFIED,
    verified_at: new Date().toISOString(),
    expires_at: oneYearFromNow,
    status: 'ACTIVE',
    source_reference: 'Ministry of Health Kenya Directorate of Mental Health',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'res-global-001',
    resource_code: 'GLOBAL_FALLBACK_CRISIS',
    resource_type: SafetyResourceType.GENERAL_SAFETY_RESOURCE,
    name: 'International Suicide & Crisis Support Network (Befrienders Worldwide)',
    description: 'International directory of verified local crisis helplines, suicide prevention hotlines, and web chat support in 32+ countries.',
    jurisdiction: 'GLOBAL_FALLBACK',
    region: 'International',
    contact_method: 'WEB',
    web: 'https://www.befrienders.org/find-support-now',
    availability_json: {
      hours: '24/7 Web Directory',
      free_of_charge: true,
      emergency_service: false
    },
    languages: ['English', 'Spanish', 'French', 'Swahili'],
    population: ['ALL'],
    risk_applicability: ['SUICIDE_SELF_HARM', 'SEVERE_DISTRESS'],
    verification_status: ResourceVerificationStatus.VERIFIED,
    verified_at: new Date().toISOString(),
    expires_at: oneYearFromNow,
    status: 'ACTIVE',
    source_reference: 'International Association for Suicide Prevention (IASP) / Befrienders Worldwide',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
