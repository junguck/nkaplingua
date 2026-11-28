/**
 * Statut de transaction renvoyé à la passerelle.
 *
 * Source : le kit de démarrage officiel SAFINUM (« respecte déjà le contrat ») renvoie le cycle
 * bancaire tel quel — `pending` au récapitulatif, `confirmed` après confirmation, `cancelled` après
 * annulation, `failed` sur erreur bancaire. C'est le défaut (`lifecycle`).
 *
 * Le mode `contract` (variable `SAFINUM_STATUS=contract`) ne garde que `none` / `pending` : c'était une
 * hypothèse prudente faite AVANT de disposer du kit (SANDBOX-SAFINUM §8). Conservé uniquement comme
 * repli si la sandbox venait à refuser une valeur.
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

export function toContractStatus(status: LifecycleStatus, mode: StatusMode = 'lifecycle'): TransactionStatus {
  return mode === 'lifecycle' ? status : CONTRACT[status];
}

export function statusModeFrom(value: string | undefined): StatusMode {
  return value === 'contract' ? 'contract' : 'lifecycle';
}
