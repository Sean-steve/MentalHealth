/**
 * MindOS Regulatory Authority Registry
 * Authority: Volumes III, XV & Appendix I
 * Catalogs statutory regulators, councils, boards, and ministries.
 */

import { RegulatoryAuthority } from '../domain/types.js';
import { RegulatoryAuthorityType } from '../domain/taxonomy.js';
import { generateUUIDv7 } from '../../platform/database/uuid.js';

export class RegulatoryAuthorityRegistry {
  private static authorities: Map<string, RegulatoryAuthority> = new Map();

  static {
    RegulatoryAuthorityRegistry.initializeCanonicalAuthorities();
  }

  public static initializeCanonicalAuthorities(): void {
    RegulatoryAuthorityRegistry.authorities.clear();

    const canonical: Omit<RegulatoryAuthority, 'id'>[] = [
      {
        code: 'ODPC',
        name: 'Office of the Data Protection Commissioner',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.STATUTORY_REGULATOR,
        scope: 'Data protection, privacy compliance, processing activity registration, DPIA oversight, breach enforcement under Data Protection Act 2019.',
        official_reference: 'Data Protection Act, No. 24 of 2019',
        website_url: 'https://www.odpc.go.ke',
        contact_details: { email: 'info@odpc.go.ke', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'DHA',
        name: 'Digital Health Agency',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.STATUTORY_REGULATOR,
        scope: 'Digital health systems governance, health data exchange, interoperability standards, health data sovereignty under Digital Health Act 2023.',
        official_reference: 'Digital Health Act, No. 15 of 2023',
        website_url: 'https://dha.go.ke',
        contact_details: { email: 'registry@dha.go.ke', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'MOH',
        name: 'Ministry of Health Kenya',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.MINISTRY,
        scope: 'National health policy, health service standards, mental health policy and public health oversight under Health Act 2017.',
        official_reference: 'Health Act, No. 21 of 2017',
        website_url: 'https://www.health.go.ke',
        contact_details: { email: 'ps@health.go.ke', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'KMPDC',
        name: 'Kenya Medical Practitioners and Dentists Council',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.COUNCIL,
        scope: 'Registration and licensing of medical and mental health professionals, professional conduct, ethical boundaries, telehealth practice guidelines.',
        official_reference: 'Medical Practitioners and Dentists Act Cap 253',
        website_url: 'https://kmpdc.go.ke',
        contact_details: { email: 'info@kmpdc.go.ke', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'PPB',
        name: 'Pharmacy and Poisons Board',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.BOARD,
        scope: 'Regulation of medicines, medical devices, Software as a Medical Device (SaMD) classifications and digital therapeutic claims.',
        official_reference: 'Pharmacy and Poisons Act Cap 244',
        website_url: 'https://pharmacyboardkenya.org',
        contact_details: { email: 'info@pharmacyboardkenya.org', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'NCK',
        name: 'Nursing Council of Kenya',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.COUNCIL,
        scope: 'Registration, licensing and scope oversight of nurses, nurse practitioners, and psychiatric nurses.',
        official_reference: 'Nurses Act Cap 257',
        website_url: 'https://nckenya.com',
        contact_details: { email: 'info@nckenya.com', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'CAK',
        name: 'Communications Authority of Kenya',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.COMMISSION,
        scope: 'Telecommunications standards, national cybersecurity incident coordination, computer misuse compliance under CMCA 2018.',
        official_reference: 'Computer Misuse and Cybercrimes Act, No. 5 of 2018',
        website_url: 'https://www.ca.go.ke',
        contact_details: { email: 'info@ca.go.ke', country: 'KE' },
        status: 'ACTIVE'
      },
      {
        code: 'NC4',
        name: 'National Computer and Cybercrimes Co-ordination Committee',
        jurisdiction_code: 'KE',
        authority_type: RegulatoryAuthorityType.COMMISSION,
        scope: 'Critical information infrastructure cyber defense, national cyber security incidents, and threat intelligence under CMCA 2018.',
        official_reference: 'Computer Misuse and Cybercrimes Act, No. 5 of 2018',
        website_url: 'https://nc4.go.ke',
        contact_details: { email: 'director@nc4.go.ke', country: 'KE' },
        status: 'ACTIVE'
      }
    ];

    for (const auth of canonical) {
      const id = generateUUIDv7();
      RegulatoryAuthorityRegistry.authorities.set(`${auth.jurisdiction_code}_${auth.code}`, {
        ...auth,
        id
      });
    }
  }

  public static get(code: string, jurisdictionCode = 'KE'): RegulatoryAuthority | undefined {
    return RegulatoryAuthorityRegistry.authorities.get(`${jurisdictionCode.toUpperCase()}_${code.toUpperCase()}`);
  }

  public static getAuthority(code: string, jurisdictionCode = 'KE'): RegulatoryAuthority | undefined {
    return RegulatoryAuthorityRegistry.get(code, jurisdictionCode);
  }

  public static list(jurisdictionCode?: string): RegulatoryAuthority[] {
    const list = Array.from(RegulatoryAuthorityRegistry.authorities.values());
    if (jurisdictionCode) {
      return list.filter((a) => a.jurisdiction_code === jurisdictionCode.toUpperCase());
    }
    return list;
  }

  public static register(authority: RegulatoryAuthority): void {
    RegulatoryAuthorityRegistry.authorities.set(
      `${authority.jurisdiction_code.toUpperCase()}_${authority.code.toUpperCase()}`,
      authority
    );
  }

  public static resetForTesting(): void {
    RegulatoryAuthorityRegistry.initializeCanonicalAuthorities();
  }
}

export { RegulatoryAuthorityRegistry as AuthoritiesRegistry };
