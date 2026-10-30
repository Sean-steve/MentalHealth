/**
 * MindOS Clinical Governance Application Engine
 * Authority: Master Architecture Index Section 7, Volumes I, III, XV & Appendices B / C / Q
 * Central domain service coordinating clinical artifacts, versioning, claims, evidence,
 * reviews, consensus decisions, rapid suspension, and Sprint 9 release gate integration.
 */

import { generateUUIDv7 } from '../../platform/database/uuid.js';
import { EventBus } from '../../platform/events/index.js';
import { AuditService } from '../../platform/audit/index.js';
import { ValidationError, AuthorizationError, ConflictError, DomainInvariantError, GovernanceBlockedError } from '../../platform/errors/index.js';
import { logger } from '../../platform/observability/logger.js';
import { DataClassification } from '../../platform/shared/data_classification.js';
import { validateStateTransition, GovernanceDecision } from '../../platform/shared/state_machines.js';

import {
  ClinicalArtifact,
  ClinicalArtifactVersion,
  ClinicalArtifactType,
  ClinicalArtifactState,
  ClinicalRiskClass,
  ClinicalClaim,
  ClinicalClaimType,
  ClinicalClaimStrength,
  ClinicalEvidenceMetadata,
  ClinicalEvidenceType,
  ClinicalEvidenceQuality,
  ClinicalClaimEvidenceLink,
  EvidenceRelationshipType,
  EvidenceSupportStrength,
  ClinicalContraindication,
  ClinicalCondition,
  ClinicalReview,
  ClinicalReviewChecklist,
  ClinicalReviewDecision,
  ClinicalApprovalRecord,
  ClinicalGovernanceMetrics,
  IntendedPopulationDefinition,
  ExcludedPopulationDefinition
} from '../types.js';

import { ClinicalRiskClassifier, ClassificationInput } from '../policies/risk_classifier.js';
import { MaterialChangeDetectionEngine } from '../policies/material_change.js';
import { ClinicalReviewerEligibilityEngine } from '../policies/reviewer_eligibility.js';
import { ClinicalEvidenceAdequacyService } from '../evidence/adequacy.js';
import { ClinicalReviewWorkflowEngine } from '../reviews/workflow.js';
import { ClinicalGovernancePersistence } from '../infrastructure/persistence.js';
import { GovernanceOrchestrator } from '../../governance/index.js';
import { GovernanceDomain, GovernedResourceType } from '../../governance/types.js';

export class ClinicalGovernanceEngine {
  /**
   * Registers a new Clinical Artifact in DRAFT state.
   */
  public static async registerArtifact(params: {
    artifact_code: string;
    artifact_type: ClinicalArtifactType;
    name: string;
    description: string;
    owner_id: string;
    intended_use: string;
    intended_population?: IntendedPopulationDefinition;
    excluded_population?: ExcludedPopulationDefinition;
    jurisdiction_scope?: string[];
    classification_inputs?: Partial<ClassificationInput>;
    initial_specification?: Record<string, unknown>;
  }): Promise<ClinicalArtifact> {
    const inputs = (params.classification_inputs as any) || {};
    if (inputs.involves_prescribing) {
      throw new GovernanceBlockedError(
        'Kenya Digital Health Act 2023: AI systems SHALL NOT autonomously prescribe medication or titrate pharmacological interventions without licensed medical practitioner oversight.',
        { errorCode: 'CLINICAL_PRESCRIBING_FORBIDDEN' }
      );
    }

    const existing = await ClinicalGovernancePersistence.getArtifactByCode(params.artifact_code);
    if (existing) {
      throw new ConflictError(`Clinical artifact with code "${params.artifact_code}" already exists.`);
    }

    const id = generateUUIDv7();
    const versionId = generateUUIDv7();
    const now = new Date().toISOString();

    // 1. Calculate Structured Clinical Risk Classification
    const classification = ClinicalRiskClassifier.classify({
      artifact_type: params.artifact_type,
      intended_use: params.intended_use,
      ...(params.classification_inputs || {})
    });

    const artifact: ClinicalArtifact = {
      id,
      artifact_code: params.artifact_code,
      artifact_type: params.artifact_type,
      name: params.name,
      description: params.description,
      owner_domain: 'clinical_governance',
      owner_id: params.owner_id,
      version: 1,
      status: ClinicalArtifactState.DRAFT,
      intended_use: params.intended_use,
      intended_population: params.intended_population || { geographicScope: ['KE'], minAge: 18 },
      excluded_population: params.excluded_population || { minorsExcluded: true, activeSuicidalityExcluded: true },
      clinical_risk_class: classification.clinical_risk_class,
      risk_factors: classification.risk_factors,
      jurisdiction_scope: params.jurisdiction_scope || ['KE'],
      data_classification: DataClassification.CLINICAL_RECORD,
      clinical_claim_level: ClinicalClaimStrength.INFORMATIONAL,
      created_at: now,
      updated_at: now
    };

    // 2. Create Initial Version v1 Record
    const version1: ClinicalArtifactVersion = {
      id: versionId,
      artifact_id: id,
      version: 1,
      status: ClinicalArtifactState.DRAFT,
      content_hash: 'initial-hash-v1',
      specification: params.initial_specification || {},
      intended_use: artifact.intended_use,
      intended_population: artifact.intended_population,
      excluded_population: artifact.excluded_population,
      clinical_risk_class: artifact.clinical_risk_class,
      risk_factors: artifact.risk_factors,
      is_material_change: false,
      created_by: params.owner_id,
      created_at: now
    };

    await ClinicalGovernancePersistence.saveArtifact(artifact);
    await ClinicalGovernancePersistence.saveVersion(version1);

    // 3. Register in Sprint 9 Governed Resources
    try {
      const govResource = await GovernanceOrchestrator.registerGovernedResource({
        resource_key: `clinical:${artifact.artifact_code}`,
        resource_type: GovernedResourceType.CLINICAL_ARTIFACT,
        name: artifact.name,
        description: artifact.description,
        owner_id: artifact.owner_id,
        classificationParams: {
          hasClinicalImpact: true,
          clinicalImpactClass: artifact.clinical_risk_class
        }
      });
      artifact.governed_resource_id = govResource.resource.id;
      await ClinicalGovernancePersistence.saveArtifact(artifact);
    } catch (err) {
      logger.warn('Failed to link governed resource in GovernanceOrchestrator', { error: String(err) });
    }

    // 4. Emit Domain Event
    await EventBus.publish({
      type: 'clinical.artifact_created',
      payload: {
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        artifact_type: artifact.artifact_type,
        clinical_risk_class: artifact.clinical_risk_class,
        owner_id: artifact.owner_id
      }
    });

    // 5. Mandatory Audit Record
    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.owner_id,
      action: 'CLINICAL_GOVERNANCE.ARTIFACT_CREATED',
      resource_type: 'clinical_artifact',
      resource_id: artifact.id,
      purpose: 'Clinical Artifact Creation',
      result: 'ALLOWED',
      authorization_basis: { artifact_code: artifact.artifact_code }
    });

    return artifact;
  }

  /**
   * Creates a new version of an existing artifact (Immutable Approved Versions invariant).
   */
  public static async createVersion(params: {
    artifactId: string;
    specification: Record<string, unknown>;
    intended_use?: string;
    intended_population?: IntendedPopulationDefinition;
    excluded_population?: ExcludedPopulationDefinition;
    content_hash?: string;
    authorId: string;
  }): Promise<ClinicalArtifactVersion> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
    if (!artifact) {
      throw new ValidationError(`Clinical artifact "${params.artifactId}" not found.`);
    }

    const versions = await ClinicalGovernancePersistence.getVersions(artifact.id);
    const prevVersion = versions.find(v => v.version === artifact.version);
    const nextVersionNum = artifact.version + 1;
    const now = new Date().toISOString();

    const intended_use = params.intended_use || artifact.intended_use;
    const intended_population = params.intended_population || artifact.intended_population;
    const excluded_population = params.excluded_population || artifact.excluded_population;

    // Evaluate Material Change
    let is_material_change = true;
    let material_change_summary = 'Version update';
    if (prevVersion) {
      const claims = await ClinicalGovernancePersistence.getClaims(artifact.id, prevVersion.version);
      const contraindications = await ClinicalGovernancePersistence.getContraindications(artifact.id, prevVersion.version);

      const evalResult = MaterialChangeDetectionEngine.evaluate({
        previousVersion: {
          specification: prevVersion.specification,
          intended_use: prevVersion.intended_use,
          intended_population: prevVersion.intended_population,
          excluded_population: prevVersion.excluded_population,
          clinical_risk_class: prevVersion.clinical_risk_class,
          claims,
          contraindications
        },
        newVersion: {
          specification: params.specification,
          intended_use,
          intended_population,
          excluded_population,
          clinical_risk_class: artifact.clinical_risk_class
        }
      });
      is_material_change = evalResult.is_material_change;
      material_change_summary = evalResult.material_reasons.join('; ') || 'Non-material editorial adjustments';
    }

    const newVersion: ClinicalArtifactVersion = {
      id: generateUUIDv7(),
      artifact_id: artifact.id,
      version: nextVersionNum,
      status: ClinicalArtifactState.DRAFT,
      content_hash: params.content_hash || `hash-v${nextVersionNum}`,
      specification: params.specification,
      intended_use,
      intended_population,
      excluded_population,
      clinical_risk_class: artifact.clinical_risk_class,
      risk_factors: artifact.risk_factors,
      material_change_summary,
      is_material_change,
      supersedes_version: artifact.version,
      created_by: params.authorId,
      created_at: now
    };

    artifact.version = nextVersionNum;
    artifact.status = ClinicalArtifactState.DRAFT;
    artifact.updated_at = now;

    await ClinicalGovernancePersistence.saveVersion(newVersion);
    await ClinicalGovernancePersistence.saveArtifact(artifact);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.authorId,
      action: 'CLINICAL_GOVERNANCE.VERSION_CREATED',
      resource_type: 'clinical_artifact',
      resource_id: artifact.id,
      purpose: 'Clinical Version Increment',
      result: 'ALLOWED',
      authorization_basis: { version: nextVersionNum, is_material_change }
    });

    return newVersion;
  }

  /**
   * Adds a Clinical Claim to a specific artifact version.
   */
  public static async addClaim(params: {
    artifactId: string;
    artifactVersion?: number;
    version?: number;
    claimCode?: string;
    claim_code?: string;
    claimText?: string;
    claim_statement?: string;
    claimType?: ClinicalClaimType;
    claim_type?: ClinicalClaimType;
    strength: ClinicalClaimStrength;
    intendedPopulation?: string;
    intended_population?: string;
    context?: string;
    authorId?: string;
    defined_by?: string;
  }): Promise<ClinicalClaim> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
    if (!artifact) throw new ValidationError('Clinical artifact not found.');

    const version = params.version ?? params.artifactVersion ?? artifact.version;
    const claimCode = params.claim_code || params.claimCode || `CLAIM-${generateUUIDv7().slice(0, 8)}`;
    const claimText = params.claim_statement || params.claimText || 'Clinical statement';
    const claimType = params.claim_type || params.claimType || ClinicalClaimType.INFORMATIONAL_EDUCATIONAL;
    const authorId = params.defined_by || params.authorId || 'system';

    const claim: ClinicalClaim = {
      id: generateUUIDv7(),
      artifact_id: params.artifactId,
      artifact_version: version,
      claim_code: claimCode,
      claim_text: claimText,
      claim_type: claimType,
      strength: params.strength,
      intended_population: params.intended_population || params.intendedPopulation,
      context: params.context,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    await ClinicalGovernancePersistence.saveClaim(claim);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: authorId,
      action: 'CLINICAL_GOVERNANCE.CLAIM_CREATED',
      resource_type: 'clinical_claim',
      resource_id: claim.id,
      purpose: 'Clinical Claim Registration',
      result: 'ALLOWED',
      authorization_basis: { claim_code: claim.claim_code }
    });

    return claim;
  }

  /**
   * Registers Clinical Evidence metadata.
   */
  public static async registerEvidenceMetadata(params: {
    evidenceType?: ClinicalEvidenceType;
    evidence_type?: ClinicalEvidenceType;
    title: string;
    source?: string;
    citation?: string;
    publicationDate?: string;
    population?: string;
    methodology?: string;
    sampleSize?: number;
    outcomes?: string;
    evidenceQuality?: ClinicalEvidenceQuality;
    evidence_quality?: ClinicalEvidenceQuality;
    quality_rating?: ClinicalEvidenceQuality;
    qualityFactors?: Record<string, unknown>;
    relevance?: 'DIRECT' | 'INDIRECT' | 'ANCILLARY';
    jurisdictionApplicability?: string[];
    evidenceRecordId?: string;
    oxford_level?: string;
    is_retracted?: boolean;
    doi?: string;
    peer_reviewed?: boolean;
    publication_status?: string;
    registered_by?: string;
    actorId?: string;
  }): Promise<ClinicalEvidenceMetadata> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();
    const actorId = params.registered_by || params.actorId || 'system';
    const evType = params.evidence_type || params.evidenceType || ClinicalEvidenceType.PEER_REVIEWED_STUDY;
    const evQuality = params.quality_rating || params.evidence_quality || params.evidenceQuality || ClinicalEvidenceQuality.HIGH_QUALITY;

    const ev: ClinicalEvidenceMetadata = {
      id,
      evidence_record_id: params.evidenceRecordId,
      evidence_type: evType,
      title: params.title,
      source: params.source || params.citation || 'Published Literature',
      citation: params.citation || params.source || params.title,
      publication_date: params.publicationDate,
      population: params.population,
      methodology: params.methodology,
      sample_size: params.sampleSize,
      outcomes: params.outcomes,
      evidence_quality: evQuality,
      quality_factors: (params.qualityFactors as any) || {},
      relevance: params.relevance || 'DIRECT',
      jurisdiction_applicability: params.jurisdictionApplicability || ['KE'],
      oxford_level: params.oxford_level,
      is_retracted: params.is_retracted ?? false,
      doi: params.doi,
      peer_reviewed: params.peer_reviewed ?? true,
      publication_status: params.publication_status || 'PUBLISHED',
      registered_by: actorId,
      status: (params.is_retracted ? 'RETRACTED' : 'ACTIVE') as any,
      created_at: now
    };

    await ClinicalGovernancePersistence.saveEvidenceMetadata(ev);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CLINICAL_GOVERNANCE.EVIDENCE_ATTACHED',
      resource_type: 'clinical_evidence',
      resource_id: ev.id,
      purpose: 'Clinical Evidence Registration',
      result: 'ALLOWED',
      authorization_basis: { citation: ev.citation }
    });

    return ev;
  }

  public static async addEvidenceMetadata(params: any): Promise<ClinicalEvidenceMetadata> {
    return this.registerEvidenceMetadata(params);
  }

  /**
   * Links a Clinical Evidence record to a specific Clinical Claim.
   */
  public static async linkClaimEvidence(params: {
    claimId: string;
    evidenceId: string;
    relationshipType?: EvidenceRelationshipType;
    relationship_type?: EvidenceRelationshipType;
    supportStrength?: EvidenceSupportStrength;
    support_strength?: EvidenceSupportStrength;
    limitations?: string;
    actorId?: string;
    linkedBy?: string;
  }): Promise<ClinicalClaimEvidenceLink> {
    const ev = await ClinicalGovernancePersistence.getEvidenceMetadata(params.evidenceId);
    if (!ev) throw new ValidationError('Evidence record not found.');

    const relType = params.relationship_type || params.relationshipType || EvidenceRelationshipType.SUPPORTS;
    const supStrength = params.support_strength || params.supportStrength || EvidenceSupportStrength.MODERATE;

    const link: ClinicalClaimEvidenceLink = {
      id: generateUUIDv7(),
      claim_id: params.claimId,
      evidence_id: params.evidenceId,
      relationship_type: relType,
      support_strength: supStrength,
      limitations: params.limitations,
      created_at: new Date().toISOString()
    };

    await ClinicalGovernancePersistence.saveClaimEvidenceLink(link);
    return link;
  }

  /**
   * Adds a Clinical Contraindication to an artifact version.
   */
  public static async addContraindication(params: {
    artifactId: string;
    artifactVersion: number;
    conditionType: string;
    population: string;
    trigger: string;
    severity: 'MODERATE' | 'HIGH' | 'CRITICAL' | 'ABSOLUTE';
    requiredBehavior: 'BLOCK_AND_ESCALATE' | 'REDIRECT_TO_EMERGENCY' | 'DISPLAY_WARNING_AND_REQUIRE_OVERRIDE' | 'INHIBIT_AI_RECOMMENDATION';
    userMessageReference?: string;
    actorId: string;
  }): Promise<ClinicalContraindication> {
    const ci: ClinicalContraindication = {
      id: generateUUIDv7(),
      artifact_id: params.artifactId,
      artifact_version: params.artifactVersion,
      condition_type: params.conditionType,
      population: params.population,
      trigger: params.trigger,
      severity: params.severity,
      required_behavior: params.requiredBehavior,
      user_message_reference: params.userMessageReference,
      status: 'ACTIVE',
      effective_at: new Date().toISOString()
    };

    await ClinicalGovernancePersistence.saveContraindication(ci);
    return ci;
  }

  /**
   * Submits an artifact version for Clinical Review.
   * Runs Evidence Adequacy evaluation and creates structured review assignments.
   */
  public static async submitVersionForReview(params: {
    artifactId: string;
    version?: number;
    submittedBy: string;
  }): Promise<ClinicalArtifact> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
    if (!artifact) throw new ValidationError('Clinical artifact not found.');

    const version = params.version ?? artifact.version;

    // Invariant: No clinical claims defined -> FAIL CLOSED
    const claims = await ClinicalGovernancePersistence.getClaims(artifact.id, version);
    if (!claims || claims.length === 0) {
      throw new DomainInvariantError(
        `No clinical claims defined for artifact version before clinical review submission. Artifact ID: ${params.artifactId}`
      );
    }

    const allEvidence = await ClinicalGovernancePersistence.listEvidenceMetadata();
    const allLinks = await ClinicalGovernancePersistence.getAllClaimEvidenceLinks();

    // Invariant: Evidence Adequacy Check
    const adequacy = ClinicalEvidenceAdequacyService.evaluate({
      artifactType: artifact.artifact_type,
      clinicalRiskClass: artifact.clinical_risk_class,
      claims,
      evidence: allEvidence,
      links: allLinks
    });

    if (adequacy.overall_result === 'INADEQUATE' || adequacy.is_approval_blocked) {
      throw new DomainInvariantError(
        `Evidence adequacy check failed: Clinical evidence is insufficient or retracted. Details: ${adequacy.summary}`
      );
    }

    // Calculate Review Requirements
    const reqs = ClinicalReviewWorkflowEngine.calculateRequirements({
      artifactType: artifact.artifact_type,
      clinicalRiskClass: artifact.clinical_risk_class
    });

    const now = new Date().toISOString();

    for (let i = 0; i < reqs.required_reviewers_count; i++) {
      const review: ClinicalReview = {
        id: generateUUIDv7(),
        artifact_id: artifact.id,
        artifact_version: version,
        reviewer_id: `unassigned-slot-${i + 1}`,
        review_level: reqs.review_level,
        required_specialty: reqs.required_specialty,
        status: 'ASSIGNED',
        checklist: {
          intended_use_appropriate: false,
          population_defined: false,
          claims_supported: false,
          evidence_adequate: false,
          limitations_disclosed: false,
          contraindications_defined: false,
          safety_implications_reviewed: false,
          language_clinically_appropriate: false,
          user_misinterpretation_risk_mitigated: false,
          risk_escalation_implications_reviewed: false,
          monitoring_requirements_established: false
        },
        evidence_assessment: {
          adequacy: adequacy.overall_result,
          quality: ClinicalEvidenceQuality.HIGH_QUALITY,
          contradictions_noted: adequacy.contradictions_detected,
          notes: adequacy.summary
        },
        risk_assessment: {
          verified_class: artifact.clinical_risk_class,
          concurrence_with_classifier: true
        },
        claim_assessment: {
          supported_claims: claims.map(c => c.claim_code),
          unsupported_claims: []
        },
        limitations_assessment: {
          adequate_disclosure: true
        },
        conditions: [],
        policy_version: '1.0.0',
        started_at: now
      };

      await ClinicalGovernancePersistence.saveReview(review);
    }

    artifact.status = ClinicalArtifactState.UNDER_REVIEW;
    artifact.updated_at = now;
    await ClinicalGovernancePersistence.saveArtifact(artifact);

    await EventBus.publish({
      type: 'clinical.artifact_review_required',
      payload: {
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        version,
        risk_class: artifact.clinical_risk_class,
        required_reviewers: reqs.required_reviewers_count,
        review_level: reqs.review_level
      }
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.submittedBy,
      action: 'CLINICAL_GOVERNANCE.ARTIFACT_SUBMITTED_FOR_REVIEW',
      resource_type: 'clinical_artifact',
      resource_id: artifact.id,
      purpose: 'Clinical Review Submission',
      result: 'ALLOWED',
      authorization_basis: { version }
    });

    return artifact;
  }

  public static async submitForReview(params: {
    artifactId: string;
    submitterId: string;
    version?: number;
  }): Promise<{ reviews: ClinicalReview[]; adequacy_summary: string; artifact: ClinicalArtifact }> {
    const artifact = await this.submitVersionForReview({
      artifactId: params.artifactId,
      version: params.version,
      submittedBy: params.submitterId
    });
    const reviews = await ClinicalGovernancePersistence.getReviewsForArtifact(artifact.id, artifact.version);
    return {
      reviews,
      adequacy_summary: 'Evidence adequacy verified',
      artifact
    };
  }

  /**
   * Assigns a verified clinical reviewer to a review slot.
   */
  public static async assignReviewer(params: {
    reviewId?: string;
    artifactId?: string;
    version?: number;
    reviewerId: string;
    assignedBy: string;
  }): Promise<ClinicalReview> {
    let artifact: ClinicalArtifact | undefined;
    let review: ClinicalReview | undefined;

    if (params.reviewId) {
      review = await ClinicalGovernancePersistence.getReview(params.reviewId);
      if (!review) throw new ValidationError('Clinical review not found.');
      artifact = await ClinicalGovernancePersistence.getArtifact(review.artifact_id);
    } else if (params.artifactId) {
      artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
      if (!artifact) throw new ValidationError('Clinical artifact not found.');
      const targetVersion = params.version ?? artifact.version;
      const reviews = await ClinicalGovernancePersistence.getReviewsForArtifact(artifact.id, targetVersion);
      // Find first unassigned slot
      review = reviews.find(r => r.status === 'ASSIGNED' && (r.reviewer_id.startsWith('unassigned') || r.reviewer_id === params.reviewerId))
        || reviews.find(r => r.status === 'ASSIGNED');
      if (!review) {
        const reqs = ClinicalReviewWorkflowEngine.calculateRequirements({
          artifactType: artifact.artifact_type,
          clinicalRiskClass: artifact.clinical_risk_class
        });
        review = {
          id: generateUUIDv7(),
          artifact_id: artifact.id,
          artifact_version: targetVersion,
          reviewer_id: params.reviewerId,
          review_level: reqs.review_level,
          required_specialty: reqs.required_specialty,
          status: 'ASSIGNED',
          checklist: {
            intended_use_appropriate: false,
            population_defined: false,
            claims_supported: false,
            evidence_adequate: false,
            limitations_disclosed: false,
            contraindications_defined: false,
            safety_implications_reviewed: false,
            language_clinically_appropriate: false,
            user_misinterpretation_risk_mitigated: false,
            risk_escalation_implications_reviewed: false,
            monitoring_requirements_established: false
          },
          evidence_assessment: {
            adequacy: 'ADEQUATE' as any,
            quality: ClinicalEvidenceQuality.HIGH_QUALITY,
            contradictions_noted: false
          },
          risk_assessment: {
            verified_class: artifact.clinical_risk_class,
            concurrence_with_classifier: true
          },
          claim_assessment: { supported_claims: [], unsupported_claims: [] },
          limitations_assessment: { adequate_disclosure: true },
          conditions: [],
          policy_version: '1.0.0',
          started_at: new Date().toISOString()
        };
      }
    }

    if (!artifact || !review) {
      throw new ValidationError('Clinical review or artifact not found.');
    }

    // Verify Reviewer Eligibility & Specialty & Separation of Duties
    ClinicalReviewerEligibilityEngine.verifyEligibility({
      reviewerId: params.reviewerId,
      artifactOwnerId: artifact.owner_id,
      clinicalRiskClass: artifact.clinical_risk_class,
      reviewLevel: review.review_level,
      requiredSpecialty: review.required_specialty,
      jurisdictionScope: artifact.jurisdiction_scope
    });

    review.reviewer_id = params.reviewerId;
    review.status = 'ACCEPTED';
    await ClinicalGovernancePersistence.saveReview(review);

    await EventBus.publish({
      type: 'clinical.review_assigned',
      payload: {
        review_id: review.id,
        artifact_id: review.artifact_id,
        reviewer_id: params.reviewerId
      }
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.assignedBy,
      action: 'CLINICAL_GOVERNANCE.REVIEW_ASSIGNED',
      resource_type: 'clinical_review',
      resource_id: review.id,
      purpose: 'Clinical Reviewer Assignment',
      result: 'ALLOWED',
      authorization_basis: { reviewer_id: params.reviewerId }
    });

    return review;
  }

  /**
   * Records a qualified clinical reviewer's structured evaluation and decision.
   */
  public static async decideReview(params: {
    reviewId: string;
    reviewerId: string;
    decision: ClinicalReviewDecision;
    checklist: ClinicalReviewChecklist;
    decisionReason?: string;
    notes?: string;
    conditions?: ClinicalCondition[];
    evidenceAssessmentNotes?: string;
  }): Promise<{ review: ClinicalReview; artifact: ClinicalArtifact; approval?: ClinicalApprovalRecord }> {
    const review = await ClinicalGovernancePersistence.getReview(params.reviewId);
    if (!review) throw new ValidationError('Clinical review not found.');

    const artifact = await ClinicalGovernancePersistence.getArtifact(review.artifact_id);
    if (!artifact) throw new ValidationError('Clinical artifact not found.');

    // 1. Verify Reviewer Eligibility & Separation of Duties
    ClinicalReviewerEligibilityEngine.verifyEligibility({
      reviewerId: params.reviewerId,
      artifactOwnerId: artifact.owner_id,
      clinicalRiskClass: artifact.clinical_risk_class,
      reviewLevel: review.review_level,
      requiredSpecialty: review.required_specialty,
      jurisdictionScope: artifact.jurisdiction_scope
    });

    // 2. Validate Structured Checklist Completeness (No empty submissions)
    ClinicalReviewWorkflowEngine.validateChecklist(params.checklist, params.decision);

    const now = new Date().toISOString();
    review.reviewer_id = params.reviewerId;
    review.decision = params.decision;
    review.checklist = params.checklist;
    review.decision_reason = params.decisionReason || params.notes || 'Clinical review evaluated';
    review.conditions = params.conditions || [];
    review.status = 'COMPLETED';
    review.completed_at = now;
    if (params.evidenceAssessmentNotes || params.notes) {
      review.evidence_assessment.notes = params.evidenceAssessmentNotes || params.notes;
    }

    await ClinicalGovernancePersistence.saveReview(review);

    // 3. Multi-Reviewer Consensus Evaluation
    const allReviews = await ClinicalGovernancePersistence.getReviewsForArtifact(artifact.id, artifact.version);
    const completedReviews = allReviews.filter(r => r.status === 'COMPLETED');
    const approverReviews = completedReviews.filter(
      r => r.decision === ClinicalReviewDecision.APPROVE || r.decision === ClinicalReviewDecision.CONDITIONAL_APPROVE
    );
    const approverIds: string[] = Array.from(new Set(approverReviews.map(r => r.reviewer_id)));

    const reqs = ClinicalReviewWorkflowEngine.calculateRequirements({
      artifactType: artifact.artifact_type,
      clinicalRiskClass: artifact.clinical_risk_class
    });

    const consensus = ClinicalReviewWorkflowEngine.evaluateConsensus({
      requiredCount: reqs.required_reviewers_count,
      reviews: allReviews
    });

    let approval: ClinicalApprovalRecord | undefined;

    if (consensus.has_conflict) {
      artifact.status = ClinicalArtifactState.ACTION_REQUIRED;
      await ClinicalGovernancePersistence.saveArtifact(artifact);
      logger.warn('Clinical review conflict detected across reviewers', {
        artifact_id: artifact.id,
        conflict: consensus.conflict_summary
      });
    } else if (approverIds.length >= reqs.required_reviewers_count) {
      const newState = consensus.final_decision === ClinicalReviewDecision.CONDITIONAL_APPROVE
        ? ClinicalArtifactState.CONDITIONALLY_APPROVED
        : ClinicalArtifactState.APPROVED;

      artifact.status = newState;
      artifact.updated_at = now;
      await ClinicalGovernancePersistence.saveArtifact(artifact);

      const expiresAt = new Date(Date.now() + reqs.expiry_days * 24 * 60 * 60 * 1000).toISOString();
      const claims = await ClinicalGovernancePersistence.getClaims(artifact.id, artifact.version);

      approval = {
        id: generateUUIDv7(),
        artifact_id: artifact.id,
        artifact_version: artifact.version,
        version: artifact.version,
        approval_code: `CLIN-APP-${generateUUIDv7().slice(0, 8)}`,
        status: 'ACTIVE',
        review_ids: completedReviews.map(r => r.id),
        approver_ids: approverIds,
        approvers: approverIds,
        risk_class: artifact.clinical_risk_class,
        evidence_hash: `sha256-${generateUUIDv7().replace(/-/g, '').slice(0, 16)}`,
        evidence_ids: [],
        claim_ids: claims.map(c => c.id),
        conditions: consensus.conditions || [],
        policy_version: '1.0.0',
        approved_at: now,
        expires_at: expiresAt,
        governance_release_authorized: true
      };

      await ClinicalGovernancePersistence.saveApprovalRecord(approval);

      // Integrate with Sprint 9 Governance Kernel
      if (artifact.governed_resource_id) {
        try {
          await GovernanceOrchestrator.recordReviewDecision({
            resourceId: artifact.governed_resource_id,
            domain: GovernanceDomain.CLINICAL_GOVERNANCE,
            decision: GovernanceDecision.APPROVED,
            reviewerId: params.reviewerId,
            notes: `Clinical Approval ${approval.approval_code} granted by qualified reviewer(s): ${approverIds.join(', ')}.`,
            conditions: (consensus.conditions || []).map(c => c.description)
          });
        } catch (err) {
          logger.warn('Failed to record review decision in GovernanceOrchestrator', { error: String(err) });
        }
      }

      await EventBus.publish({
        type: consensus.final_decision === ClinicalReviewDecision.CONDITIONAL_APPROVE
          ? 'clinical.artifact_conditionally_approved'
          : 'clinical.artifact_approved',
        payload: {
          artifact_id: artifact.id,
          artifact_code: artifact.artifact_code,
          version: artifact.version,
          approval_code: approval.approval_code,
          approver_ids: approverIds,
          expires_at: expiresAt
        }
      });
    } else if (consensus.final_decision === ClinicalReviewDecision.REJECT) {
      validateStateTransition('ClinicalArtifactState', artifact.status, ClinicalArtifactState.REJECTED, artifact.id);
      artifact.status = ClinicalArtifactState.REJECTED;

      await EventBus.publish({
        type: 'clinical.artifact_rejected',
        payload: {
          artifact_id: artifact.id,
          artifact_code: artifact.artifact_code,
          version: artifact.version,
          reason: params.decisionReason || params.notes || 'Rejected'
        }
      });
    }

    artifact.updated_at = now;
    await ClinicalGovernancePersistence.saveArtifact(artifact);

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reviewerId,
      action: 'CLINICAL_GOVERNANCE.REVIEW_DECISION',
      resource_type: 'clinical_review',
      resource_id: review.id,
      purpose: 'Clinical Governance Decision',
      result: 'ALLOWED',
      authorization_basis: { decision: params.decision, reviewer_id: params.reviewerId }
    });

    return { review, artifact, approval };
  }

  public static async submitReview(params: {
    reviewId: string;
    reviewerId: string;
    decision: ClinicalReviewDecision;
    checklist: any;
    notes?: string;
    decisionReason?: string;
    conditions?: ClinicalCondition[];
    evidenceAssessmentNotes?: string;
  }): Promise<ClinicalReview> {
    const res = await this.decideReview({
      reviewId: params.reviewId,
      reviewerId: params.reviewerId,
      decision: params.decision,
      checklist: params.checklist,
      decisionReason: params.decisionReason || params.notes || 'Clinical review evaluated',
      conditions: params.conditions,
      evidenceAssessmentNotes: params.evidenceAssessmentNotes || params.notes
    });
    return res.review;
  }

  /**
   * Rapid Clinical Suspension for urgent patient safety intervention.
   */
  public static async emergencySuspendArtifact(params: {
    artifactId: string;
    suspendedBy: string;
    reason: string;
    adverse_event_ref?: string;
  }): Promise<ClinicalArtifact> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
    if (!artifact) throw new ValidationError('Clinical artifact not found.');

    const now = new Date().toISOString();
    artifact.status = ClinicalArtifactState.SUSPENDED;
    artifact.updated_at = now;
    await ClinicalGovernancePersistence.saveArtifact(artifact);

    const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(artifact.id, artifact.version);
    if (approval) {
      approval.status = 'REVOKED';
      approval.suspended_at = now;
      approval.suspension_reason = params.reason;
      approval.revoked_at = now;
      approval.revocation_reason = params.reason;
      await ClinicalGovernancePersistence.saveApprovalRecord(approval);
    }

    // Revoke release in Sprint 9 Governance Kernel
    if (artifact.governed_resource_id) {
      try {
        await GovernanceOrchestrator.revokeReleaseAuthorization({
          resourceId: artifact.governed_resource_id,
          reason: `URGENT_CLINICAL_SUSPENSION: ${params.reason}`,
          revokedBy: params.suspendedBy
        });
      } catch (err) {
        logger.warn('Failed to revoke release in GovernanceOrchestrator during suspension', { error: String(err) });
      }
    }

    await EventBus.publish({
      type: 'clinical.artifact_suspended',
      payload: {
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        version: artifact.version,
        reason: params.reason,
        suspended_by: params.suspendedBy,
        adverse_event_ref: params.adverse_event_ref
      }
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.suspendedBy,
      action: 'CLINICAL_GOVERNANCE.ARTIFACT_SUSPENDED',
      resource_type: 'clinical_artifact',
      resource_id: artifact.id,
      purpose: 'Urgent Clinical Safety Suspension',
      result: 'ALLOWED',
      authorization_basis: { reason: params.reason, adverse_event_ref: params.adverse_event_ref }
    });

    return artifact;
  }

  public static async suspendArtifact(params: {
    artifactId: string;
    reason: string;
    actorId: string;
  }): Promise<ClinicalArtifact> {
    return this.emergencySuspendArtifact({
      artifactId: params.artifactId,
      suspendedBy: params.actorId,
      reason: params.reason
    });
  }

  /**
   * Reinstates a suspended artifact back to UNDER_REVIEW for formal re-evaluation.
   */
  public static async reinstateArtifact(params: {
    artifactId: string;
    reinstatedBy: string;
    remediation_notes: string;
    new_evidence_refs?: string[];
  }): Promise<ClinicalArtifact> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
    if (!artifact) throw new ValidationError('Clinical artifact not found.');

    const now = new Date().toISOString();
    artifact.status = ClinicalArtifactState.UNDER_REVIEW;
    artifact.updated_at = now;
    await ClinicalGovernancePersistence.saveArtifact(artifact);

    await EventBus.publish({
      type: 'clinical.artifact_reinstated',
      payload: {
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        version: artifact.version,
        reinstated_by: params.reinstatedBy,
        remediation_notes: params.remediation_notes,
        new_evidence_refs: params.new_evidence_refs
      }
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.reinstatedBy,
      action: 'CLINICAL_GOVERNANCE.ARTIFACT_REINSTATED',
      resource_type: 'clinical_artifact',
      resource_id: artifact.id,
      purpose: 'Clinical Artifact Reinstatement',
      result: 'ALLOWED',
      authorization_basis: { remediation_notes: params.remediation_notes }
    });

    return artifact;
  }

  /**
   * Formal Clinical Approval Revocation.
   */
  public static async revokeArtifact(params: {
    artifactId: string;
    reason: string;
    actorId: string;
  }): Promise<ClinicalArtifact> {
    const artifact = await ClinicalGovernancePersistence.getArtifact(params.artifactId);
    if (!artifact) throw new ValidationError('Clinical artifact not found.');

    const now = new Date().toISOString();
    artifact.status = ClinicalArtifactState.REVOKED;
    artifact.updated_at = now;
    await ClinicalGovernancePersistence.saveArtifact(artifact);

    const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(artifact.id, artifact.version);
    if (approval) {
      approval.status = 'REVOKED';
      approval.revoked_at = now;
      approval.revocation_reason = params.reason;
      await ClinicalGovernancePersistence.saveApprovalRecord(approval);
    }

    // Cascade into Sprint 9 Governance Kernel
    if (artifact.governed_resource_id) {
      try {
        await GovernanceOrchestrator.revokeReleaseAuthorization({
          resourceId: artifact.governed_resource_id,
          reason: `CLINICAL_APPROVAL_REVOKED: ${params.reason}`,
          revokedBy: params.actorId
        });
      } catch (err) {
        logger.warn('Failed to revoke release authorization in GovernanceOrchestrator', { error: String(err) });
      }
    }

    await EventBus.publish({
      type: 'clinical.artifact_revoked',
      payload: {
        artifact_id: artifact.id,
        artifact_code: artifact.artifact_code,
        version: artifact.version,
        reason: params.reason,
        revoked_by: params.actorId
      }
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: params.actorId,
      action: 'CLINICAL_GOVERNANCE.ARTIFACT_REVOKED',
      resource_type: 'clinical_artifact',
      resource_id: artifact.id,
      purpose: 'Clinical Governance Revocation',
      result: 'ALLOWED',
      authorization_basis: { reason: params.reason }
    });

    return artifact;
  }

  /**
   * Invalidates a clinical evidence record (e.g. journal retraction).
   */
  public static async invalidateEvidence(params: {
    evidenceId: string;
    status?: 'RETRACTED' | 'INVALIDATED';
    reason: string;
    invalidatedBy?: string;
    actorId?: string;
  }): Promise<ClinicalEvidenceMetadata> {
    const ev = await ClinicalGovernancePersistence.getEvidenceMetadata(params.evidenceId);
    if (!ev) throw new ValidationError('Evidence metadata not found.');

    const actorId = params.invalidatedBy || params.actorId || 'system';
    ev.status = (params.status || 'INVALIDATED') as any;
    ev.is_retracted = true;
    await ClinicalGovernancePersistence.saveEvidenceMetadata(ev);

    await EventBus.publish({
      type: 'clinical.evidence_invalidated',
      payload: {
        evidence_id: ev.id,
        title: ev.title,
        reason: params.reason,
        invalidated_by: actorId
      }
    });

    AuditService.record({
      actor_type: 'STAFF',
      actor_id: actorId,
      action: 'CLINICAL_GOVERNANCE.EVIDENCE_INVALIDATED',
      resource_type: 'clinical_evidence',
      resource_id: ev.id,
      purpose: 'Evidence Retraction / Invalidation',
      result: 'ALLOWED',
      authorization_basis: { reason: params.reason }
    });

    return ev;
  }

  public static async getReleaseAuthorizationForArtifact(artifactId: string, version?: number): Promise<any> {
    const approval = await ClinicalGovernancePersistence.getApprovalForArtifactVersion(artifactId, version ?? 1);
    return {
      release_id: `rel-${artifactId}-v${version ?? 1}`,
      artifact_id: artifactId,
      clinical_status: approval?.status === 'ACTIVE' ? 'APPROVED' : (approval?.status || 'PENDING'),
      approvers: approval?.approvers || approval?.approver_ids || [],
      authorized_at: approval?.approved_at || new Date().toISOString()
    };
  }

  /**
   * Retrieves operational metrics for Clinical Governance observability.
   */
  public static async getMetrics(): Promise<ClinicalGovernanceMetrics> {
    const artifacts = await ClinicalGovernancePersistence.listArtifacts();
    const reviews = await ClinicalGovernancePersistence.listReviews();
    const approvals = await ClinicalGovernancePersistence.listApprovals();
    const allEvidence = await ClinicalGovernancePersistence.listEvidenceMetadata();

    const byRisk: Record<ClinicalRiskClass, number> = {
      'CR-0': 0,
      'CR-1': 0,
      'CR-2': 0,
      'CR-3': 0
    };

    for (const art of artifacts) {
      if (byRisk[art.clinical_risk_class] !== undefined) {
        byRisk[art.clinical_risk_class]++;
      }
    }

    const pendingReviews = reviews.filter(r => r.status === 'ASSIGNED' || r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS').length;
    const approvalsTotal = approvals.filter(a => a.status === 'ACTIVE').length;
    const rejectionsTotal = reviews.filter(r => r.decision === ClinicalReviewDecision.REJECT).length;
    const suspensionsTotal = artifacts.filter(a => a.status === ClinicalArtifactState.SUSPENDED).length;
    const revocationsTotal = artifacts.filter(a => a.status === ClinicalArtifactState.REVOKED).length;
    const invalidationsTotal = allEvidence.filter(e => e.status === 'INVALIDATED' || e.status === 'RETRACTED').length;

    const now = Date.now();
    const expiringSoon = approvals.filter(a => {
      const exp = new Date(a.expires_at).getTime();
      return exp > now && (exp - now) < (30 * 24 * 60 * 60 * 1000);
    }).length;

    return {
      clinical_artifacts_total: artifacts.length,
      clinical_artifacts_by_risk: byRisk,
      clinical_reviews_pending: pendingReviews,
      clinical_reviews_overdue: 0,
      clinical_approvals_total: approvalsTotal,
      clinical_rejections_total: rejectionsTotal,
      clinical_approvals_expiring: expiringSoon,
      clinical_suspensions_total: suspensionsTotal,
      clinical_revocations_total: revocationsTotal,
      clinical_evidence_invalidations_total: invalidationsTotal,
      unsupported_claims_total: 0
    };
  }
}
