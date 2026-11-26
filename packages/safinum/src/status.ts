/**
 * Statut de transaction renvoyé à la passerelle.
 *
 * La documentation ne garantit que `none` et `pending` ; une valeur hors contrat rend toute la
 * réponse `INVALID_RESPONSE`. Par défaut on applique donc la correspondance de SANDBOX-SAFINUM §8 :
 * l'identifiant de la transaction porte l'information, le statut reste dans les valeurs observées.
 * Le mode `lifecycle` (variable `SAFINUM_STATUS=lifecycle`) renvoie le cycle bancaire brut, à n'activer
 * qu'après l'avoir vu accepté par la sandbox.
 */
export type ContractStatus = 'none' | 'pending';
export type LifecycleStatus = 'none' | 'pending' | 'confirmed' | 'cancelled' | 'failed';
export type TransactionStatus = ContractStatus | LifecycleStatus;
export type StatusMode = 'contract' | 'lifecycle';

const CONTRACT: Readonly<Record<LifecycleStatus, ContractStatus>> = {
  none: 'none',
  pending: 'pending',
  // §8 : exécutée → `pending` + id de la transaction confirmée ; annulée / échouée → `none` + id.
  confirmed: 'pending',
  cancelled: 'none',
  failed: 'none',
};

export function toContractStatus(status: LifecycleStatus, mode: StatusMode = 'contract'): TransactionStatus {
  return mode === 'lifecycle' ? status : CONTRACT[status];
}

export function statusModeFrom(value: string | undefined): StatusMode {
  return value === 'lifecycle' ? 'lifecycle' : 'contract';
}
