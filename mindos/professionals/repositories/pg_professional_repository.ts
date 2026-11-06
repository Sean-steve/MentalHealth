import { getPool } from '../../platform/database/index.js';
import { IProfessionalRepository } from './interfaces.js';
import {
  ProfessionalProfileEntity,ProfessionalCredentialEntity,ProfessionalRegistrationEntity,
  ProfessionalVerificationCaseEntity,ProfessionalScopeEntity,ProfessionalSpecialtyEntity,
  ProfessionalSpecialtyAssignmentEntity,ProviderEntity,ProviderOrganizationEntity,
  ProfessionalOrganizationAffiliationEntity,ServiceOfferingEntity
} from '../domain/entities.js';

type Kind='PROFILE'|'CREDENTIAL'|'REGISTRATION'|'VERIFICATION_CASE'|'SCOPE'|'SPECIALTY'|'SPECIALTY_ASSIGNMENT'|'PROVIDER'|'ORGANIZATION'|'AFFILIATION'|'SERVICE';

const payload=<T>(v:any):T=>(typeof v==='string'?JSON.parse(v):v) as T;

export class PgProfessionalRepository implements IProfessionalRepository{
  private async save(kind:Kind,id:string,value:unknown,key1?:string,key2?:string,status?:string){
    await getPool().query(`INSERT INTO professional_runtime_entities(entity_type,entity_id,key_1,key_2,status,payload,updated_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW())
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET key_1=EXCLUDED.key_1,key_2=EXCLUDED.key_2,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=NOW()`,
      [kind,id,key1||null,key2||null,status||null,JSON.stringify(value)]);
  }
  private async one<T>(kind:Kind,id:string):Promise<T|null>{const r=await getPool().query('SELECT payload FROM professional_runtime_entities WHERE entity_type=$1 AND entity_id=$2',[kind,id]);return r.rows[0]?payload<T>(r.rows[0].payload):null;}
  private async list<T>(kind:Kind,key1?:string,status?:string):Promise<T[]>{const vals:any[]=[kind];let sql='SELECT payload FROM professional_runtime_entities WHERE entity_type=$1';if(key1!==undefined){vals.push(key1);sql+=` AND key_1=$${vals.length}`;}if(status!==undefined){vals.push(status);sql+=` AND status=$${vals.length}`;}sql+=' ORDER BY updated_at,entity_id';const r=await getPool().query(sql,vals);return r.rows.map((x:any)=>payload<T>(x.payload));}

  async saveProfile(v:ProfessionalProfileEntity){return this.save('PROFILE',v.id,v,v.user_id,undefined,String(v.status));}
  async findProfileById(id:string){return this.one<ProfessionalProfileEntity>('PROFILE',id);}
  async findProfileByUserId(userId:string){return (await this.list<ProfessionalProfileEntity>('PROFILE',userId))[0]||null;}
  async listProfiles(filter?:Partial<ProfessionalProfileEntity>){let x=await this.list<ProfessionalProfileEntity>('PROFILE');if(filter?.status)x=x.filter(v=>v.status===filter.status);if(filter?.verification_status)x=x.filter(v=>v.verification_status===filter.verification_status);if(filter?.professional_type)x=x.filter(v=>v.professional_type===filter.professional_type);return x;}

  async saveCredential(v:ProfessionalCredentialEntity){return this.save('CREDENTIAL',v.id,v,v.professional_id,undefined,String(v.status));}
  async findCredentialById(id:string){return this.one<ProfessionalCredentialEntity>('CREDENTIAL',id);}
  async listCredentialsByProfessionalId(id:string){return this.list<ProfessionalCredentialEntity>('CREDENTIAL',id);}
  async listAllCredentials(){return this.list<ProfessionalCredentialEntity>('CREDENTIAL');}

  async saveRegistration(v:ProfessionalRegistrationEntity){return this.save('REGISTRATION',v.id,v,v.professional_id,`${v.authority_id.toUpperCase()}:${v.registration_number.trim().toUpperCase()}`,v.status);}
  async findRegistrationById(id:string){return this.one<ProfessionalRegistrationEntity>('REGISTRATION',id);}
  async findRegistrationByAuthorityAndNumber(authorityId:string,registrationNumber:string){const key=`${authorityId.toUpperCase()}:${registrationNumber.trim().toUpperCase()}`;const r=await getPool().query("SELECT payload FROM professional_runtime_entities WHERE entity_type='REGISTRATION' AND key_2=$1 LIMIT 1",[key]);return r.rows[0]?payload<ProfessionalRegistrationEntity>(r.rows[0].payload):null;}
  async listRegistrationsByProfessionalId(id:string){return this.list<ProfessionalRegistrationEntity>('REGISTRATION',id);}
  async listAllRegistrations(){return this.list<ProfessionalRegistrationEntity>('REGISTRATION');}

  async saveVerificationCase(v:ProfessionalVerificationCaseEntity){return this.save('VERIFICATION_CASE',v.id,v,v.professional_id,undefined,String(v.status));}
  async findVerificationCaseById(id:string){return this.one<ProfessionalVerificationCaseEntity>('VERIFICATION_CASE',id);}
  async findVerificationCaseByProfessionalId(id:string){return (await this.list<ProfessionalVerificationCaseEntity>('VERIFICATION_CASE',id))[0]||null;}
  async listVerificationCases(status?:string){return this.list<ProfessionalVerificationCaseEntity>('VERIFICATION_CASE',undefined,status);}

  async saveScope(v:ProfessionalScopeEntity){return this.save('SCOPE',v.id,v,v.professional_id,undefined,v.status);}
  async findScopeById(id:string){return this.one<ProfessionalScopeEntity>('SCOPE',id);}
  async findActiveScopeByProfessionalId(id:string){const x=await this.list<ProfessionalScopeEntity>('SCOPE',id);return x.find(v=>v.status==='ACTIVE'||v.status==='RESTRICTED')||null;}
  async listScopesByProfessionalId(id:string){return this.list<ProfessionalScopeEntity>('SCOPE',id);}

  async saveSpecialty(v:ProfessionalSpecialtyEntity){return this.save('SPECIALTY',v.id,v,v.code,undefined,v.is_active?'ACTIVE':'INACTIVE');}
  async listSpecialties(){return this.list<ProfessionalSpecialtyEntity>('SPECIALTY');}
  async saveSpecialtyAssignment(v:ProfessionalSpecialtyAssignmentEntity){return this.save('SPECIALTY_ASSIGNMENT',v.id,v,v.professional_id,v.specialty_code,v.verification_status);}
  async listSpecialtyAssignments(id:string){return this.list<ProfessionalSpecialtyAssignmentEntity>('SPECIALTY_ASSIGNMENT',id);}

  async saveProvider(v:ProviderEntity){return this.save('PROVIDER',v.id,v,v.professional_profile_id,undefined,String(v.status));}
  async findProviderById(id:string){return this.one<ProviderEntity>('PROVIDER',id);}
  async findProviderByProfileId(id:string){return (await this.list<ProviderEntity>('PROVIDER',id))[0]||null;}
  async listProviders(filter?:Partial<ProviderEntity>){let x=await this.list<ProviderEntity>('PROVIDER');if(filter?.status)x=x.filter(v=>v.status===filter.status);if(filter?.verification_status)x=x.filter(v=>v.verification_status===filter.verification_status);if(filter?.discoverability_status)x=x.filter(v=>v.discoverability_status===filter.discoverability_status);return x;}

  async saveOrganization(v:ProviderOrganizationEntity){return this.save('ORGANIZATION',v.id,v,undefined,undefined,v.status);}
  async findOrganizationById(id:string){return this.one<ProviderOrganizationEntity>('ORGANIZATION',id);}
  async saveAffiliation(v:ProfessionalOrganizationAffiliationEntity){return this.save('AFFILIATION',v.id,v,v.professional_id,v.organization_id,v.status);}
  async listAffiliationsByProfessionalId(id:string){return this.list<ProfessionalOrganizationAffiliationEntity>('AFFILIATION',id);}

  async saveServiceOffering(v:ServiceOfferingEntity){return this.save('SERVICE',v.id,v,v.provider_id,v.service_code,String(v.status));}
  async findServiceOfferingById(id:string){return this.one<ServiceOfferingEntity>('SERVICE',id);}
  async listServiceOfferingsByProviderId(id:string){return this.list<ServiceOfferingEntity>('SERVICE',id);}
  async listAllActiveServices(){return this.list<ServiceOfferingEntity>('SERVICE',undefined,'ACTIVE');}

  async reset(){await getPool().query('DELETE FROM professional_runtime_entities');}
}
