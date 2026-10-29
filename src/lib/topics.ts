/**
 * Topic conversations: a conversation chat about a topic the learner picks
 * from a list or types. The topic only steers the reply (one short rule in the
 * analysis prompt); corrections work as in any other chat. Pure, no AI: the
 * opening message is fixed, so starting a chat is instant.
 */
import { type Tense, TENSE_HINTS, TENSE_LABELS } from "@/lib/taxonomy";

export interface TopicPreset {
  id: string;
  label: string;
  /** One line under the label in the picker. */
  description: string;
  /** Reply rule for the analysis prompt. Keep it to 1–2 sentences: it shares the prompt with the correction rules. */
  rule: string;
  /** Opening questions; one is picked at random. */
  openings: readonly string[];
}

export const TOPIC_PRESETS: readonly TopicPreset[] = [
  {
    id: "swe-interview",
    label: "Software engineer interview",
    description: "Behavioral questions, like a real job interview.",
    rule: "Role-play: you are the interviewer in a behavioral job interview for a software engineer position. React briefly to each answer like a real interviewer and ask ONE new interview question (experience, projects, teamwork, conflicts, failures, motivation); give feedback on the answers only if the learner asks for it.",
    openings: [
      "Hi, thanks for coming in today. Let’s start with an easy one: can you tell me a bit about yourself and your experience?",
      "Nice to meet you! To get started, could you walk me through a project you’re proud of?",
      "Thanks for joining. First question: why are you looking for a new role right now?",
    ],
  },
  {
    id: "technical-interview",
    label: "Technical interview",
    description: "Talk through system design and engineering trade-offs.",
    rule: "Role-play: you are the interviewer in a technical interview for a software engineer, talking through system design and engineering trade-offs. React briefly to the learner’s ideas and ask ONE follow-up question that makes them explain or justify a choice; don’t ask them to write code.",
    openings: [
      "Let’s do a design question. How would you design a URL shortener like bit.ly? Start wherever you like.",
      "Imagine our API is getting slow as traffic grows. How would you find the problem, and what would you try first?",
      "Tell me about the architecture of a system you’ve worked on. What would you change if you built it again?",
    ],
  },
  {
    id: "tech-news",
    label: "Technology & AI news",
    description: "Opinions on what’s new in tech and AI.",
    rule: "The conversation is about technology and AI news: share a short opinion or fact of your own, and ask ONE question about the learner’s opinion or experience.",
    openings: [
      "Have you read any interesting tech or AI news lately? What caught your attention?",
      "How has AI changed the way you work in the last year?",
      "Which new technology are you most excited about right now, and why?",
    ],
  },
  {
    id: "standup",
    label: "Daily stand-up",
    description: "Work updates with a teammate: progress, plans and blockers.",
    rule: "Role-play: you are the learner’s teammate in a daily stand-up or work sync. React like a colleague and ask ONE question about their progress, next steps, blockers or decisions.",
    openings: [
      "Morning! What did you work on yesterday?",
      "Hey, quick sync before the meeting: how is your current task going?",
      "Hi! Anything blocking you this week?",
    ],
  },
  {
    id: "travel-small-talk",
    label: "Small talk & travel",
    description: "Casual chat with someone you just met on a trip.",
    rule: "Role-play: you are a friendly stranger the learner just met while traveling. Make casual small talk about travel, places, food and plans, and ask ONE natural question back.",
    openings: [
      "Hi! Are you here on holiday or for work?",
      "This place is great, isn’t it? Where are you from?",
      "Have you been here before? Any tips on where to eat?",
    ],
  },
];

/** Longest custom topic kept: enough for a short description, short enough not to crowd the prompt. */
export const TOPIC_MAX_LENGTH = 100;

export function findPreset(id: string | null | undefined): TopicPreset | null {
  return TOPIC_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * A custom topic as typed, made safe to quote in the prompt and to use in a
 * sentence: one line, no double quotes, capped, and not ending in punctuation
 * or a space (also after the cut).
 */
export function cleanTopic(text: string): string {
  return text
    .replace(/["“”]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPIC_MAX_LENGTH)
    .replace(/[\s.,;:!?]+$/, "");
}

/** What a topic chat is about: a preset (its label is the topic), or a custom topic. */
export interface TopicChoice {
  preset: string | null;
  topic: string;
}

/** The topic to save from what the learner chose, or null when there's none (unknown preset, empty text). */
export function resolveTopic(input: { preset?: string | null; topic?: string | null }): TopicChoice | null {
  const preset = findPreset(input.preset);
  if (preset) return { preset: preset.id, topic: preset.label };
  const topic = cleanTopic(input.topic ?? "");
  return topic ? { preset: null, topic } : null;
}

/** Extra reply rule for the analysis prompt. */
export function topicRule(choice: TopicChoice): string {
  const preset = findPreset(choice.preset);
  if (preset) return preset.rule;
  return `The learner chose the topic of this conversation: "${cleanTopic(choice.topic)}". Keep the conversation on that topic (following the learner into closely related subjects) and end your reply with ONE question about it.`;
}

/** The first assistant message, stored without an AI call. */
export function topicOpening(choice: TopicChoice, random = Math.random): string {
  const preset = findPreset(choice.preset);
  if (preset) return preset.openings[Math.floor(random() * preset.openings.length)];
  return `Let’s talk about ${cleanTopic(choice.topic)}. To start, what got you interested in it, and what do you already know about it?`;
}

export function topicTitle(choice: TopicChoice): string {
  return findPreset(choice.preset)?.label ?? cleanTopic(choice.topic);
}

/**
 * Extra reply rule when the learner also wants to practice a tense in a topic conversation: the
 * question that ends the reply is phrased so that answering it needs the tense. The topic stays the
 * same and the tense is never named, so the conversation doesn't turn into a grammar lesson.
 */
export function topicTenseRule(tense: Tense): string {
  const label = TENSE_LABELS[tense].toLowerCase();
  return `The learner also wants to practice the ${label} (${TENSE_HINTS[tense]}) in this conversation: whenever it fits the topic, phrase your question so that a natural answer needs the ${label}. Never mention grammar or tenses.`;
}
