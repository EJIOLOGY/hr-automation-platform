import { Injectable } from '@nestjs/common';

export interface HrDocumentRequestDefinition {
  id: string;
  label: string;
}

@Injectable()
export class HrDocumentRequestService {
  private readonly documentTypes: ReadonlyMap<string, HrDocumentRequestDefinition> =
    new Map([
      [
        'employment_verification_letter',
        {
          id: 'employment_verification_letter',
          label: 'Employment Verification Letter (EVL)',
        },
      ],
      [
        'salary_certificate',
        {
          id: 'salary_certificate',
          label: 'Salary Certificate',
        },
      ],
      [
        'no_objection_certificate',
        {
          id: 'no_objection_certificate',
          label: 'No Objection Certificate (NOC)',
        },
      ],
      [
        'other_hr_document',
        {
          id: 'other_hr_document',
          label: 'Other HR Document',
        },
      ],
    ]);

  createRequest(documentTypeId: string): HrDocumentRequestDefinition | null {
    return this.documentTypes.get(documentTypeId) ?? null;
  }
}
