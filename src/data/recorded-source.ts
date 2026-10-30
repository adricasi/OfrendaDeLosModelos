import type { RecordedVoiceSource } from "../ritual/steps.js";
import type { RecordedAnswer } from "../ritual/types.js";
import type {
  RecordedMedium,
  RecordedVoice,
  RecordedVoicesFile,
  RecordingProvenance,
  VoiceLanguage,
} from "./recorded-voices.js";

/**
 * AC-005.2, AC-009.1: the label shown with every recording. It names the model and tag, the
 * date, and the licence the output is reproduced under.
 */
export function recordingCredit(provenance: RecordingProvenance): string {
  const { model, recordedAt } = provenance;
  return `Recorded ${recordedAt.slice(0, 10)} from ${model.name} (${model.tag}). Model licence: ${model.licence.name}; output reproduced with attribution.`;
}

function pick<T extends { readonly language: VoiceLanguage }>(
  candidates: readonly T[],
  language: VoiceLanguage | null | undefined,
): T | undefined {
  return candidates.find((c) => c.language === language) ?? candidates[0];
}

function answerOf(entry: RecordedVoice | RecordedMedium | undefined): RecordedAnswer | null {
  return entry === undefined ? null : { text: entry.answer, credit: recordingCredit(entry) };
}

/** Serves the recordings in recorded-voices.json; the answer is returned exactly as recorded. */
export function createRecordedSource(file: RecordedVoicesFile): RecordedVoiceSource {
  return {
    hasRecordings: file.voices.length + file.medium.length > 0,
    lookup: (ancestorId, questionId, language) =>
      answerOf(
        pick(
          file.voices.filter((v) => v.ancestorId === ancestorId && v.questionId === questionId),
          language,
        ),
      ),
    lookupMedium: (questionId, language) =>
      answerOf(
        pick(
          file.medium.filter((m) => m.questionId === questionId),
          language,
        ),
      ),
  };
}
