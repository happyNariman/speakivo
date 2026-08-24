import { eq, and, sql } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import {
  userLanguages,
  learningMistakes,
  userVocabulary,
  vocabulary,
  userTopicProgress,
  languageLevelAssessments,
} from "../../src/db/schema/index.js";
import type { EvalCase } from "../types.js";
import type { EvalFixtureContext } from "../fixtures/test-fixtures.js";

export interface SideEffectsEvaluationResult {
  passed: boolean;
  failures: string[];
}

export async function evaluateSideEffects(
  evalCase: EvalCase,
  fixture: EvalFixtureContext,
): Promise<SideEffectsEvaluationResult> {
  const failures: string[] = [];
  const expectedEffects = evalCase.expectations.sideEffects ?? [];

  for (const effect of expectedEffects) {
    switch (effect.type) {
      // 1. Mistake assertions
      case "mistake_recorded": {
        const mistakes = await db
          .select()
          .from(learningMistakes)
          .where(eq(learningMistakes.userLanguageId, fixture.userLanguage.id));

        if (mistakes.length === 0) {
          failures.push("Expected a learning mistake to be recorded in DB, but none found");
        } else if (effect.details?.category) {
          const match = mistakes.some((m) => m.category === effect.details?.category);
          if (!match) {
            failures.push(
              `Expected mistake with category '${effect.details.category}', but found categories: ${mistakes
                .map((m) => m.category)
                .join(", ")}`,
            );
          }
        }
        break;
      }

      case "mistake_not_recorded": {
        const mistakes = await db
          .select()
          .from(learningMistakes)
          .where(eq(learningMistakes.userLanguageId, fixture.userLanguage.id));

        if (mistakes.length > 0) {
          failures.push(
            `Expected no mistakes to be recorded, but found ${mistakes.length} mistake(s)`,
          );
        }
        break;
      }

      // 2. Vocabulary assertions
      case "vocabulary_saved": {
        const userVocabs = await db
          .select({
            lemma: vocabulary.lemma,
            word: vocabulary.word,
          })
          .from(userVocabulary)
          .innerJoin(vocabulary, eq(userVocabulary.vocabularyId, vocabulary.id))
          .where(eq(userVocabulary.userLanguageId, fixture.userLanguage.id));

        if (userVocabs.length === 0) {
          failures.push("Expected vocabulary to be saved in DB, but none found");
        } else if (effect.details?.lemma) {
          const match = userVocabs.some(
            (v) => v.lemma.toLowerCase() === effect.details?.lemma?.toLowerCase(),
          );
          if (!match) {
            failures.push(
              `Expected saved vocabulary lemma '${effect.details.lemma}', but found: ${userVocabs
                .map((v) => v.lemma)
                .join(", ")}`,
            );
          }
        }
        break;
      }

      case "vocabulary_not_saved": {
        const userVocabs = await db
          .select()
          .from(userVocabulary)
          .where(eq(userVocabulary.userLanguageId, fixture.userLanguage.id));

        // If no setup vocabs were created, length must be 0
        const initialVocabCount = evalCase.setup?.vocabulary?.length ?? 0;
        if (userVocabs.length > initialVocabCount) {
          failures.push(
            `Expected no new vocabulary to be saved, but user vocabulary count increased from ${initialVocabCount} to ${userVocabs.length}`,
          );
        }
        break;
      }

      // 3. Topic progress assertions
      case "topic_progress_updated": {
        const progressList = await db
          .select()
          .from(userTopicProgress)
          .where(eq(userTopicProgress.userLanguageId, fixture.userLanguage.id));

        if (progressList.length === 0) {
          failures.push("Expected topic progress to exist in DB, but none found");
        } else {
          const initialAttempts =
            evalCase.setup?.topics?.reduce((acc, t) => acc + (t.attempts ?? 1), 0) ?? 0;
          const currentAttempts = progressList.reduce((acc, p) => acc + p.attempts, 0);

          if (evalCase.setup?.topics && currentAttempts <= initialAttempts) {
            failures.push(
              `Expected topic attempts to increase (was ${initialAttempts}, now ${currentAttempts})`,
            );
          }
        }
        break;
      }

      case "topic_progress_not_updated": {
        const progressList = await db
          .select()
          .from(userTopicProgress)
          .where(eq(userTopicProgress.userLanguageId, fixture.userLanguage.id));

        const initialAttempts =
          evalCase.setup?.topics?.reduce((acc, t) => acc + (t.attempts ?? 1), 0) ?? 0;
        const currentAttempts = progressList.reduce((acc, p) => acc + p.attempts, 0);

        if (currentAttempts > initialAttempts) {
          failures.push(
            `Expected topic progress not to be updated, but attempts increased from ${initialAttempts} to ${currentAttempts}`,
          );
        }
        break;
      }

      // 4. Vocabulary progress assertions
      case "vocabulary_progress_updated": {
        const userVocabs = await db
          .select()
          .from(userVocabulary)
          .where(eq(userVocabulary.userLanguageId, fixture.userLanguage.id));

        const initialTimesSeen =
          evalCase.setup?.vocabulary?.reduce((acc, v) => acc + (v.timesSeen ?? 1), 0) ?? 0;
        const currentTimesSeen = userVocabs.reduce((acc, v) => acc + v.timesSeen, 0);

        if (currentTimesSeen <= initialTimesSeen) {
          failures.push(
            `Expected vocabulary timesSeen to increase (was ${initialTimesSeen}, now ${currentTimesSeen})`,
          );
        }
        break;
      }

      // 5. Level Assessment assertions
      case "assessment_created": {
        const assessments = await db
          .select()
          .from(languageLevelAssessments)
          .where(
            eq(
              languageLevelAssessments.userLanguageId,
              fixture.userLanguage.id,
            ),
          );

        if (assessments.length === 0) {
          failures.push("Expected a level assessment proposal in DB, but none found");
        } else if (effect.details?.level) {
          const match = assessments.some(
            (a) => a.proposedLevel === effect.details?.level,
          );
          if (!match) {
            failures.push(
              `Expected assessment with proposedLevel '${effect.details.level}', but found: ${assessments
                .map((a) => a.proposedLevel)
                .join(", ")}`,
            );
          }
        }
        break;
      }

      case "assessment_not_created": {
        const assessments = await db
          .select()
          .from(languageLevelAssessments)
          .where(
            and(
              eq(
                languageLevelAssessments.userLanguageId,
                fixture.userLanguage.id,
              ),
              eq(languageLevelAssessments.status, "pending"),
            ),
          );

        const initialPending =
          evalCase.setup?.assessments?.filter((a) => a.status === "pending").length ?? 0;
        if (assessments.length > initialPending) {
          failures.push(
            `Expected no new pending assessment created, but found ${assessments.length}`,
          );
        }
        break;
      }

      // 6. User Level assertions
      case "level_updated": {
        const [lang] = await db
          .select()
          .from(userLanguages)
          .where(eq(userLanguages.id, fixture.userLanguage.id))
          .limit(1);

        if (!lang) {
          failures.push("User language record missing in DB");
        } else if (effect.details?.level && lang.level !== effect.details.level) {
          failures.push(
            `Expected user level to be updated to '${effect.details.level}', but current level is '${lang.level}'`,
          );
        } else if (lang.level === evalCase.user.level) {
          failures.push(
            `Expected user level to change from initial '${evalCase.user.level}', but remained unchanged`,
          );
        }
        break;
      }

      case "level_not_updated": {
        const [lang] = await db
          .select()
          .from(userLanguages)
          .where(eq(userLanguages.id, fixture.userLanguage.id))
          .limit(1);

        if (lang && lang.level !== evalCase.user.level) {
          failures.push(
            `Expected user level to remain '${evalCase.user.level}', but was updated to '${lang.level}'`,
          );
        }
        break;
      }

      // 7. No write mutations (Casual conversation)
      case "no_mutations":
      case "no_write_mutations": {
        const mistakes = await db
          .select()
          .from(learningMistakes)
          .where(eq(learningMistakes.userLanguageId, fixture.userLanguage.id));

        const userVocabs = await db
          .select()
          .from(userVocabulary)
          .where(eq(userVocabulary.userLanguageId, fixture.userLanguage.id));

        const assessments = await db
          .select()
          .from(languageLevelAssessments)
          .where(
            eq(
              languageLevelAssessments.userLanguageId,
              fixture.userLanguage.id,
            ),
          );

        const [lang] = await db
          .select()
          .from(userLanguages)
          .where(eq(userLanguages.id, fixture.userLanguage.id))
          .limit(1);

        if (mistakes.length > 0) {
          failures.push(
            `Expected no write mutations, but found ${mistakes.length} recorded mistake(s)`,
          );
        }
        if (userVocabs.length > 0) {
          failures.push(
            `Expected no write mutations, but found ${userVocabs.length} user vocabulary record(s)`,
          );
        }
        if (assessments.length > 0) {
          failures.push(
            `Expected no write mutations, but found ${assessments.length} assessment record(s)`,
          );
        }
        if (lang && lang.level !== evalCase.user.level) {
          failures.push(
            `Expected no write mutations, but user level changed to '${lang.level}'`,
          );
        }
        break;
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
