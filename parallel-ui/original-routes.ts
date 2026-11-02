import * as movements from '../app/api/movements/route';
import * as notes from '../app/api/notes/route';
import * as settings from '../app/api/settings/route';
import * as utilities from '../app/api/utilities/route';
import * as commonAccounts from '../app/api/common-accounts/route';
import * as planning from '../app/api/planning/route';
import * as chat from '../app/api/chat/route';
import * as financePlans from '../app/api/finance-plans/route';
import * as balanceAdjustments from '../app/api/balance-adjustments/route';
import * as acknowledgements from '../app/api/duplicate-acknowledgements/route';
import * as decisions from '../app/api/decisions/route';
import * as travel from '../app/api/travel/route';
import * as insurancePlans from '../app/api/insurance-plans/route';
import * as backup from '../app/api/backup/route';
export const routes: Record<string,any> = {
 '/api/movements':movements,'/api/notes':notes,'/api/settings':settings,'/api/utilities':utilities,
 '/api/common-accounts':commonAccounts,'/api/planning':planning,'/api/chat':chat,
 '/api/finance-plans':financePlans,'/api/balance-adjustments':balanceAdjustments,
 '/api/duplicate-acknowledgements':acknowledgements,'/api/decisions':decisions,
 '/api/travel':travel,'/api/insurance-plans':insurancePlans,'/api/backup':backup,
};
