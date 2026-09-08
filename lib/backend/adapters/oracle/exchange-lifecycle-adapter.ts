import type { DealLifecycleContract, OfferLifecycleContract } from '@/lib/backend/contracts/offers-deals';
import type { OracleHttpTransport } from '@/lib/backend/adapters/oracle/http-transport';
import { createOracleDealWriteAdapter, createOracleOfferWriteAdapter } from '@/lib/backend/adapters/oracle/exchange-adapter';
import { createOracleDealReadAdapter, createOracleOfferReadAdapter } from '@/lib/backend/adapters/oracle/exchange-read-adapter';

export function createOracleOfferLifecycleAdapter(transport: OracleHttpTransport): OfferLifecycleContract {
  return { ...createOracleOfferReadAdapter(transport), ...createOracleOfferWriteAdapter(transport) };
}

export function createOracleDealLifecycleAdapter(transport: OracleHttpTransport): DealLifecycleContract {
  return { ...createOracleDealReadAdapter(transport), ...createOracleDealWriteAdapter(transport) };
}
