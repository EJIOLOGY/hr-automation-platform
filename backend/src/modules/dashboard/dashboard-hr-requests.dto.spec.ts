import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HrRequestListQueryDto } from './dashboard-hr-requests.dto';

describe('HrRequestListQueryDto', () => {
  it('accepts canonical document request filters', async () => {
    const dto = plainToInstance(HrRequestListQueryDto, {
      status: 'OPEN',
      documentType: 'salary_certificate',
      limit: '10',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(10);
  });

  it('rejects an invalid escalation status', async () => {
    const dto = plainToInstance(HrRequestListQueryDto, {
      status: 'PENDING',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an invalid document type', async () => {
    const dto = plainToInstance(HrRequestListQueryDto, {
      documentType: 'employment_letter',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
