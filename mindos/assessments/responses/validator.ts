/**
 * MindOS Assessment Response Validator
 * Authority: Master Architecture Index Section 7, Volumes I, XV
 * 
 * Validates responses against question schema, option definitions, and visibility state.
 */

import { AssessmentQuestion, QuestionType } from '../domain/types.js';
import { AssessmentResponseInvalidError, AssessmentBranchViolationError } from '../../platform/errors/index.js';

export class AssessmentResponseValidator {
  public static validateResponse(params: {
    question: AssessmentQuestion;
    value: unknown;
    isVisible: boolean;
  }): void {
    const { question, value, isVisible } = params;

    // 1. Branch visibility check
    if (!isVisible && value !== undefined && value !== null) {
      throw new AssessmentBranchViolationError(
        `Question "${question.question_code}" is currently hidden by branching logic; responses are not accepted.`
      );
    }

    if (value === undefined || value === null) {
      if (question.required && isVisible) {
        throw new AssessmentResponseInvalidError(
          `Question "${question.question_code}" is required.`
        );
      }
      return;
    }

    // 2. Question type checks
    switch (question.question_type) {
      case QuestionType.SINGLE_CHOICE:
      case QuestionType.LIKERT: {
        if (question.options && question.options.length > 0) {
          const isValidOption = question.options.some(
            (opt) => opt.option_code === value || opt.label === value || opt.score_value === value || String(opt.score_value) === String(value)
          );
          if (!isValidOption) {
            throw new AssessmentResponseInvalidError(
              `Invalid option selected for question "${question.question_code}".`
            );
          }
        }
        break;
      }

      case QuestionType.MULTI_CHOICE: {
        if (!Array.isArray(value)) {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" requires an array of options.`
          );
        }
        if (question.options && question.options.length > 0) {
          const validCodes = new Set(question.options.map((o) => o.option_code));
          const hasInvalid = (value as unknown[]).some((v) => !validCodes.has(String(v)));
          if (hasInvalid) {
            throw new AssessmentResponseInvalidError(
              `One or more selected options for question "${question.question_code}" are invalid.`
            );
          }
        }
        break;
      }

      case QuestionType.BOOLEAN: {
        if (typeof value !== 'boolean') {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" requires a boolean value.`
          );
        }
        break;
      }

      case QuestionType.INTEGER: {
        if (!Number.isInteger(value)) {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" requires an integer value.`
          );
        }
        const num = value as number;
        if (question.response_schema.min !== undefined && num < question.response_schema.min) {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" value ${num} is below minimum ${question.response_schema.min}.`
          );
        }
        if (question.response_schema.max !== undefined && num > question.response_schema.max) {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" value ${num} exceeds maximum ${question.response_schema.max}.`
          );
        }
        break;
      }

      case QuestionType.SCALE: {
        if (typeof value !== 'number') {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" requires a numeric scale value.`
          );
        }
        const num = value as number;
        if (question.response_schema.min !== undefined && num < question.response_schema.min) {
          throw new AssessmentResponseInvalidError(
            `Scale value ${num} is below minimum allowed.`
          );
        }
        if (question.response_schema.max !== undefined && num > question.response_schema.max) {
          throw new AssessmentResponseInvalidError(
            `Scale value ${num} exceeds maximum allowed.`
          );
        }
        break;
      }

      case QuestionType.TEXT_SHORT: {
        if (typeof value !== 'string') {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" requires text.`
          );
        }
        if (question.response_schema.max_length && value.length > question.response_schema.max_length) {
          throw new AssessmentResponseInvalidError(
            `Text length exceeds maximum allowed length.`
          );
        }
        break;
      }

      case QuestionType.TEXT_LONG: {
        if (typeof value !== 'string') {
          throw new AssessmentResponseInvalidError(
            `Question "${question.question_code}" requires text.`
          );
        }
        break;
      }

      default:
        break;
    }
  }
}
