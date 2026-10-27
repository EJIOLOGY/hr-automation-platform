import type { Prisma } from '../../../generated/prisma/client';
import {
  CANONICAL_ALLOWANCES,
  type AllowanceMetadata,
} from './calculation-engine';

export interface LoadedAllowanceDefinitions {
  /** Canonical definitions overlaid with the database definitions (same rule the calculation uses). */
  meta: Record<string, AllowanceMetadata>;
  /** canonicalName -> AllowanceDefinition.id, for PayslipLine.allowanceDefinitionId. */
  idByCanonicalName: Map<string, string>;
}

/**
 * Single source of truth for the allowance definitions used when (re)calculating a payslip, so the initial
 * calculation and any later recalculation of the same payslip always produce the same line items.
 */
export async function loadAllowanceDefinitions(
  db: Pick<Prisma.TransactionClient, 'allowanceDefinition'>,
): Promise<LoadedAllowanceDefinitions> {
  const dbDefinitions = await db.allowanceDefinition.findMany();
  const meta: Record<string, AllowanceMetadata> = { ...CANONICAL_ALLOWANCES };
  const idByCanonicalName = new Map<string, string>();

  for (const def of dbDefinitions) {
    meta[def.canonicalName] = {
      canonicalName: def.canonicalName,
      displayLabel: def.displayLabel,
      classification: def.classification,
      affectsGrossEarnings: def.affectsGrossEarnings,
      affectsNetServiceFee: def.affectsNetServiceFee,
      supportsArrears: def.supportsArrears,
      sortOrder: def.sortOrder,
      parentCanonicalName:
        CANONICAL_ALLOWANCES[def.canonicalName]?.parentCanonicalName,
    };
    idByCanonicalName.set(def.canonicalName, def.id);
  }

  return { meta, idByCanonicalName };
}
