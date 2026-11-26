import type {
  Account,
  BankingError,
  ChannelId,
  LanguageCode,
  Result,
  Trace,
  Transaction,
  TurnInput,
  TurnResponse,
} from '@nkap/contracts';

export interface SendOptions {
  /** Langue imposée (menu de langue). Absente : le moteur suit la langue de l'utilisateur. */
  readonly lang?: LanguageCode;
}

/**
 * Ce dont une interface a besoin, et rien de plus. Deux implémentations :
 * - `LocalNkapClient` : moteur embarqué, hors ligne (démo, mobile sans réseau) ;
 * - client HTTP vers la gateway (J1) : même interface, aucun écran ne change.
 */
export interface NkapClient {
  readonly channel: ChannelId;
  readonly userId: string;
  readonly institutionName: string;
  send(input: TurnInput, options?: SendOptions): Promise<TurnResponse>;
  account(): Promise<Result<Account, BankingError>>;
  history(limit: number): Promise<readonly Transaction[]>;
  /** Chaque tour produit une trace (tableau de bord du jury, rafraîchissement du solde). */
  onTrace(listener: (trace: Trace) => void): () => void;
  reset(): Promise<void>;
}
