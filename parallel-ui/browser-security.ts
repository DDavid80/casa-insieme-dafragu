import {remote} from './security-transport';
export async function requireAppAccess(_request: Request) {return null;}
export async function verifyRecoveryCode(code:string){return (await remote({action:'security:verify',recoveryCode:code})).verified===true;}
