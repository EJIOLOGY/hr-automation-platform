import { Test, TestingModule } from '@nestjs/testing';
import { EscalationController } from './escalation.controller';

describe('EscalationController', () => {
  let controller: EscalationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EscalationController],
    }).compile();

    controller = module.get<EscalationController>(EscalationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
