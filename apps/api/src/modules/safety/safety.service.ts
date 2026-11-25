import { Injectable } from '@nestjs/common';
import { assess, type AssessInput, type Assessment } from '@plateguard/domain';

/**
 * Business layer: calls the engine. Later also the plate status machine, the assessment snapshot
 * and the outbox event, all in one transaction through the safety repository.
 */
@Injectable()
export class SafetyService {
  preview(input: AssessInput): Assessment {
    return assess(input);
  }
}
