import type { QuickActionId } from '@nkap/client';
import { Banknote, History, Percent, Receipt, Send, Smartphone, Wallet, type LucideIcon } from 'lucide-react';

export const QUICK_ACTION_ICONS: Readonly<Record<QuickActionId, LucideIcon>> = {
  balance: Wallet,
  send: Send,
  withdraw: Banknote,
  airtime: Smartphone,
  bill: Receipt,
  history: History,
  fees: Percent,
};
