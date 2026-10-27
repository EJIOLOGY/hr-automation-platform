import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import type { PayslipLineDraft } from './calculation.types';

/**
 * Replaces a payslip's line items with freshly calculated ones, exactly as the initial calculation lays them out:
 * BASE lines first, ARREARS lines linked to their BASE parent through `parentLineId`.
 * Two statements regardless of the number of lines (delete + one createMany), so it is safe inside a BULK
 * transaction. Ids are generated up front so parent links can be written in the same insert.
 */
export async function replacePayslipLines(
  tx: Pick<Prisma.TransactionClient, 'payslipLine'>,
  payslipId: string,
  lines: PayslipLineDraft[],
  idByCanonicalName: Map<string, string>,
): Promise<void> {
  await tx.payslipLine.deleteMany({ where: { payslipId } });
  if (lines.length === 0) return;

  const idByLine = new Map<string, string>();
  for (const line of lines) idByLine.set(line.canonicalName, randomUUID());

  await tx.payslipLine.createMany({
    data: lines.map((line) => ({
      id: idByLine.get(line.canonicalName)!,
      payslipId,
      allowanceDefinitionId: idByCanonicalName.get(line.canonicalName) ?? null,
      name: line.name,
      kind: line.kind,
      parentLineId: line.parentCanonicalName
        ? (idByLine.get(line.parentCanonicalName) ?? null)
        : null,
      amount: new Prisma.Decimal(line.amount),
      taxClass: line.taxClass,
      sortOrder: line.sortOrder,
      sourceCell: line.sourceCell ?? null,
    })),
  });
}
