import { Test, TestingModule } from '@nestjs/testing';
import { EscalationService } from './escalation.service';

describe('EscalationService', () => {
  let service: EscalationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EscalationService],
    }).compile();

    service = module.get<EscalationService>(EscalationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
