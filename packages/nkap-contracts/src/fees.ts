/** Tranche de la grille de frais : bornes incluses, frais au premier franc de la tranche. */
export interface FeeBracket {
  readonly min: number;
  readonly max: number;
  readonly fee: number;
}
