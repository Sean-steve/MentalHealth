import { PgLaunchRepository,resetLaunchRepository,setLaunchRepository } from '../launch/index.js';

export interface Sprint28RuntimeStatus{
  configured:boolean;
  persistence:'POSTGRES'|'IN_MEMORY_DEFAULT';
  jurisdiction:'KE';
  raw_participant_identity_persisted:false;
  ci_may_authorize_real_launch:false;
}

let status:Sprint28RuntimeStatus={
  configured:false,persistence:'IN_MEMORY_DEFAULT',jurisdiction:'KE',
  raw_participant_identity_persisted:false,ci_may_authorize_real_launch:false
};

export function configureSprint28Runtime(options:{usePostgres?:boolean}={}):Sprint28RuntimeStatus{
  const usePostgres=options.usePostgres??process.env.NODE_ENV==='production';
  if(usePostgres)setLaunchRepository(new PgLaunchRepository());else resetLaunchRepository();
  status={configured:true,persistence:usePostgres?'POSTGRES':'IN_MEMORY_DEFAULT',jurisdiction:'KE',raw_participant_identity_persisted:false,ci_may_authorize_real_launch:false};
  return {...status};
}
export function getSprint28RuntimeStatus(){return {...status};}
export function resetSprint28RuntimeForTesting(){resetLaunchRepository();status={configured:false,persistence:'IN_MEMORY_DEFAULT',jurisdiction:'KE',raw_participant_identity_persisted:false,ci_may_authorize_real_launch:false};}
