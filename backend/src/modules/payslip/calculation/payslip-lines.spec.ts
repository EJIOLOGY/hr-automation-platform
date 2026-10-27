import { replacePayslipLines } from './payslip-lines';
import type { PayslipLineDraft } from './calculation.types';

describe('replacePayslipLines', () => {
  const draft = (over: Partial<PayslipLineDraft>) =>
    ({ canonicalName: 'X', name: 'X', kind: 'BASE', taxClass: 'TAXABLE', sortOrder: 0, amount: 10, ...over }) as unknown as PayslipLineDraft;

  it('deletes then inserts in one createMany, linking ARREARS to the BASE parent', async () => {
    const tx = { payslipLine: { deleteMany: jest.fn(), createMany: jest.fn() } };
    await replacePayslipLines(
      tx as never,
      'p1',
      [draft({ canonicalName: 'HOUSING' }), draft({ canonicalName: 'HOUSING_ARREARS', kind: 'ARREARS', parentCanonicalName: 'HOUSING' } as never)],
      new Map([['HOUSING', 'def-1']]),
    );
    expect(tx.payslipLine.deleteMany).toHaveBeenCalledWith({ where: { payslipId: 'p1' } });
    const rows = tx.payslipLine.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0].allowanceDefinitionId).toBe('def-1');
    expect(rows[1].allowanceDefinitionId).toBeNull();
    expect(rows[1].parentLineId).toBe(rows[0].id);
  });

  it('only deletes when there are no lines', async () => {
    const tx = { payslipLine: { deleteMany: jest.fn(), createMany: jest.fn() } };
    await replacePayslipLines(tx as never, 'p1', [], new Map());
    expect(tx.payslipLine.createMany).not.toHaveBeenCalled();
  });
});
