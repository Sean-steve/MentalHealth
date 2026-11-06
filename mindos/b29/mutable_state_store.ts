import crypto from 'node:crypto';
import { getPool,FieldEncryptor } from '../platform/database/index.js';

export interface B29MutableStateRecord<T=unknown>{
  domain:string;
  entity_type:string;
  entity_id:string;
  owner_id?:string;
  parent_id?:string;
  status?:string;
  payload:T;
  updated_at:string;
}

export class B29MutableStateStore{
  static async put<T>(input:{
    domain:string;entity_type:string;entity_id:string;owner_id?:string;parent_id?:string;status?:string;payload:T;
  }):Promise<void>{
    const raw=JSON.stringify(input.payload);
    const payloadCiphertext=await FieldEncryptor.encryptField('b29_mutable_state','payload',raw,'health-sensitive-master');
    const integrityHash=crypto.createHash('sha256').update(raw).digest('hex');
    await getPool().query(`INSERT INTO b29_mutable_state(domain,entity_type,entity_id,owner_id,parent_id,status,payload_ciphertext,integrity_hash,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT(domain,entity_type,entity_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,parent_id=EXCLUDED.parent_id,status=EXCLUDED.status,payload_ciphertext=EXCLUDED.payload_ciphertext,integrity_hash=EXCLUDED.integrity_hash,updated_at=NOW()`,
      [input.domain,input.entity_type,input.entity_id,input.owner_id||null,input.parent_id||null,input.status||null,payloadCiphertext,integrityHash]);
  }

  static async delete(domain:string,entityType:string,entityId:string):Promise<void>{
    await getPool().query('DELETE FROM b29_mutable_state WHERE domain=$1 AND entity_type=$2 AND entity_id=$3',[domain,entityType,entityId]);
  }

  private static async decode<T>(row:any):Promise<B29MutableStateRecord<T>>{
    const raw=await FieldEncryptor.decryptField<string>(row.payload_ciphertext);
    const text=typeof raw==='string'?raw:JSON.stringify(raw);
    const hash=crypto.createHash('sha256').update(text).digest('hex');
    if(hash!==row.integrity_hash)throw new Error('B29_MUTABLE_STATE_INTEGRITY_MISMATCH');
    return {
      domain:row.domain,entity_type:row.entity_type,entity_id:row.entity_id,
      owner_id:row.owner_id||undefined,parent_id:row.parent_id||undefined,status:row.status||undefined,
      payload:JSON.parse(text) as T,
      updated_at:row.updated_at instanceof Date?row.updated_at.toISOString():String(row.updated_at)
    };
  }

  static async list<T>(domain:string,entityType?:string):Promise<Array<B29MutableStateRecord<T>>>{
    const r=entityType
      ?await getPool().query('SELECT * FROM b29_mutable_state WHERE domain=$1 AND entity_type=$2 ORDER BY updated_at,entity_id',[domain,entityType])
      :await getPool().query('SELECT * FROM b29_mutable_state WHERE domain=$1 ORDER BY entity_type,updated_at,entity_id',[domain]);
    return Promise.all(r.rows.map((x:any)=>this.decode<T>(x)));
  }

  static async get<T>(domain:string,entityType:string,entityId:string):Promise<B29MutableStateRecord<T>|null>{
    const r=await getPool().query('SELECT * FROM b29_mutable_state WHERE domain=$1 AND entity_type=$2 AND entity_id=$3 LIMIT 1',[domain,entityType,entityId]);
    return r.rows[0]?this.decode<T>(r.rows[0]):null;
  }

  static async clearDomain(domain:string):Promise<void>{
    await getPool().query('DELETE FROM b29_mutable_state WHERE domain=$1',[domain]);
  }
}
