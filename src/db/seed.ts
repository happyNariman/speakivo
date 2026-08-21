import { db, queryClient } from "./client.js";
import { languages, learningTopics, vocabulary } from "./schema/index.js";

export async function seed(): Promise<void> {
  console.log("[db] Seeding initial data...");

  // 1. Languages
  const initialLanguages = [
    { code: "en", name: "English", nativeName: "English" },
    { code: "ru", name: "Russian", nativeName: "Русский" },
    { code: "de", name: "German", nativeName: "Deutsch" },
    { code: "fr", name: "French", nativeName: "Français" },
    { code: "es", name: "Spanish", nativeName: "Español" },
    { code: "it", name: "Italian", nativeName: "Italiano" },
    { code: "pt", name: "Portuguese", nativeName: "Português" },
    { code: "ja", name: "Japanese", nativeName: "日本語" },
    { code: "ko", name: "Korean", nativeName: "한국어" },
    { code: "zh", name: "Chinese", nativeName: "中文" },
  ];

  await db.insert(languages).values(initialLanguages).onConflictDoNothing();
  console.log(`[db] Seeded ${initialLanguages.length} languages`);

  // 2. Learning Topics for English
  const initialTopics = [
    {
      languageCode: "en",
      type: "grammar" as const,
      slug: "present-simple",
      name: "Present Simple",
      description: "Habits, general truths, and regular everyday actions",
    },
    {
      languageCode: "en",
      type: "grammar" as const,
      slug: "past-simple",
      name: "Past Simple",
      description: "Completed past events and specific past times",
    },
    {
      languageCode: "en",
      type: "grammar" as const,
      slug: "present-perfect",
      name: "Present Perfect",
      description: "Past actions with a connection or relevance to the present",
    },
    {
      languageCode: "en",
      type: "grammar" as const,
      slug: "articles",
      name: "Articles (a, an, the)",
      description: "Using definite (the) and indefinite (a/an) articles correctly",
    },
    {
      languageCode: "en",
      type: "grammar" as const,
      slug: "conditionals",
      name: "Conditionals",
      description: "Zero, first, second, and third conditional structures",
    },
    {
      languageCode: "en",
      type: "vocabulary" as const,
      slug: "daily-routine",
      name: "Daily Routine",
      description: "Vocabulary for everyday activities and schedule",
    },
    {
      languageCode: "en",
      type: "vocabulary" as const,
      slug: "travel-and-directions",
      name: "Travel & Directions",
      description: "Essential phrases and words for navigating and traveling",
    },
    // German topics
    {
      languageCode: "de",
      type: "grammar" as const,
      slug: "der-die-das",
      name: "Genders & Articles (der, die, das)",
      description: "Grammatical gender and definite articles in German",
    },
    {
      languageCode: "de",
      type: "grammar" as const,
      slug: "cases-nominativ-akkusativ",
      name: "Nominative & Accusative Cases",
      description: "Subject and direct object cases in German",
    },
  ];

  await db.insert(learningTopics).values(initialTopics).onConflictDoNothing();
  console.log(`[db] Seeded ${initialTopics.length} learning topics`);

  // 3. Sample Vocabulary
  const initialVocabulary = [
    // English
    {
      languageCode: "en",
      lemma: "book",
      word: "book",
      partOfSpeech: "noun",
      translation: "книга / Buch / libro",
    },
    {
      languageCode: "en",
      lemma: "learn",
      word: "learn",
      partOfSpeech: "verb",
      translation: "учить / lernen / aprender",
    },
    {
      languageCode: "en",
      lemma: "speak",
      word: "speak",
      partOfSpeech: "verb",
      translation: "говорить / sprechen / hablar",
    },
    {
      languageCode: "en",
      lemma: "friend",
      word: "friend",
      partOfSpeech: "noun",
      translation: "друг / Freund / amigo",
    },
    {
      languageCode: "en",
      lemma: "water",
      word: "water",
      partOfSpeech: "noun",
      translation: "вода / Wasser / agua",
    },
    // German
    {
      languageCode: "de",
      lemma: "Buch",
      word: "Buch",
      partOfSpeech: "noun",
      translation: "book / книга",
    },
    {
      languageCode: "de",
      lemma: "lernen",
      word: "lernen",
      partOfSpeech: "verb",
      translation: "learn / учить",
    },
    {
      languageCode: "de",
      lemma: "sprechen",
      word: "sprechen",
      partOfSpeech: "verb",
      translation: "speak / говорить",
    },
  ];

  await db.insert(vocabulary).values(initialVocabulary).onConflictDoNothing();
  console.log(`[db] Seeded ${initialVocabulary.length} vocabulary words`);

  console.log("✅ [db] Seeding completed successfully");
}

// Run when executed directly
if (process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")) {
  seed()
    .then(async () => {
      await queryClient.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ [db] Seeding failed:", err);
      await queryClient.end();
      process.exit(1);
    });
}
