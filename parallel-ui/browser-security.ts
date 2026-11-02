export async function requireAppAccess(_request: Request) {return null;}
export async function verifyRecoveryCode(_code: string) {throw new Error('Il codice di recupero di Sites non è trasferito nel backup: questa operazione protetta richiede configurazione sul nuovo archivio.');}
