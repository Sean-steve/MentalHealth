import { Router } from 'express';
import { getB29RuntimeStatus } from './runtime.js';

export const b29Router=Router();

b29Router.get('/b29/status',(_req,res)=>{
  const runtime=getB29RuntimeStatus();
  res.json({
    phase:'B29',
    title:'Full Backend Persistence & Local Certification',
    status:runtime.persistence==='POSTGRES'?'PERSISTENCE_READY':'LEGACY_IN_MEMORY_MODE',
    runtime,
    external_activation:{
      ai:'CONFIGURABLE_MOCK_OR_PROVIDER',
      payments:'CONFIGURABLE_MOCK_OR_PROVIDER',
      notifications:'CONFIGURABLE_MOCK_OR_PROVIDER',
      regulatory_authorization:'NOT_SYNTHESIZED',
      crisis_resources:'MUST_BE_CURRENTLY_VERIFIED_BEFORE_AUTHORITATIVE_DISPLAY'
    }
  });
});

export * from './runtime.js';
