import type { CurrencyTransaction, ApiListResponse } from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface CurrencyBalanceView {
  currency_code: string;
  name: string;
  is_premium: boolean;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

export class CurrencyModule {
  constructor(private readonly http: HttpClient) {}

  /** Fetch all currency balances for the current user. */
  async getBalances(): Promise<CurrencyBalanceView[]> {
    const { data } = await this.http.get<{ data: CurrencyBalanceView[] }>('/client/currencies');
    return data.data;
  }

  /** Fetch transaction history for the current user. */
  async getTransactions(options?: {
    currency_code?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: CurrencyTransaction[]; total: number }> {
    const params: Record<string, string> = {};
    if (options?.currency_code) params.currency_code = options.currency_code;
    if (options?.limit !== undefined) params.limit = String(options.limit);
    if (options?.offset !== undefined) params.offset = String(options.offset);

    const queryStr = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';

    const { data } = await this.http.get<ApiListResponse<CurrencyTransaction>>(
      `/client/currencies/transactions${queryStr}`,
    );
    return { data: data.data, total: data.total };
  }
}
