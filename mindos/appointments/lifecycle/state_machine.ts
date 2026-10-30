/**
 * MindOS Canonical Appointment State Machine Guard
 * Authority: Master Architecture Index Section 7, Volumes I, III & Appendix C
 */

import { AppointmentState, validateStateTransition } from '../../platform/shared/state_machines.js';
import { AppointmentInvalidStateError } from '../../platform/errors/index.js';

export class AppointmentStateMachine {
  public static canTransition(from: AppointmentState, to: AppointmentState): boolean {
    try {
      validateStateTransition('AppointmentState', from, to, 'test-id', 'test-actor');
      return true;
    } catch {
      return false;
    }
  }

  public static transition(appointmentId: string, from: AppointmentState, to: AppointmentState, actorId: string): void {
    try {
      validateStateTransition('AppointmentState', from, to, appointmentId, actorId);
    } catch (err: any) {
      throw new AppointmentInvalidStateError(
        `Invalid appointment state transition from ${from} to ${to}: ${err.message}`,
        { details: { from, to, appointmentId, actorId } }
      );
    }
  }
}
