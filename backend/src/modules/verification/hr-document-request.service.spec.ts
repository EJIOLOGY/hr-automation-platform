import { Test, TestingModule } from '@nestjs/testing';
import { HrDocumentRequestService } from './hr-document-request.service';

describe('HrDocumentRequestService', () => {
  let service: HrDocumentRequestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HrDocumentRequestService],
    }).compile();

    service = module.get<HrDocumentRequestService>(HrDocumentRequestService);
  });

  it('creates a supported document request definition', () => {
    expect(service.createRequest('employment_verification_letter')).toEqual({
      id: 'employment_verification_letter',
      label: 'Employment Verification Letter (EVL)',
    });
  });

  it('supports the three primary document requests and other documents', () => {
    expect(service.createRequest('salary_certificate')?.label).toBe(
      'Salary Certificate',
    );
    expect(service.createRequest('no_objection_certificate')?.label).toBe(
      'No Objection Certificate (NOC)',
    );
    expect(service.createRequest('other_hr_document')?.label).toBe(
      'Other HR Document',
    );
  });

  it('returns null for an unsupported document type', () => {
    expect(service.createRequest('unsupported')).toBeNull();
  });
});
