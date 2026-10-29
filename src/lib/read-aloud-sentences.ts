/**
 * Built-in read-aloud sentences, one set per pronunciation category. Each one
 * makes sense with either word of a minimal pair (ship / sheep), so speech-to-text
 * can't guess the right word from context: what it writes is what it heard.
 */
import type { PronunciationCategory } from "./taxonomy";

export interface SoundSentence {
  text: string;
  /** The word that carries the sound, and the one a learner may say instead. */
  target: string;
  confusedWith: string;
}

export const SOUND_SENTENCES: Record<Exclude<PronunciationCategory, "other" | "schwa_reduction">, SoundSentence[]> = {
  vowel_length: [
    { text: "I saw a big ship in the picture.", target: "ship", confusedWith: "sheep" },
    { text: "Can you fill this form for me?", target: "fill", confusedWith: "feel" },
    { text: "They want to live here.", target: "live", confusedWith: "leave" },
    { text: "Please don't sit on that seat.", target: "seat", confusedWith: "sit" },
    { text: "It was a cheap trip.", target: "cheap", confusedWith: "chip" },
    { text: "Look at that green hill.", target: "hill", confusedWith: "heel" },
    { text: "The glass is full.", target: "full", confusedWith: "fool" },
    { text: "Did you pull it?", target: "pull", confusedWith: "pool" },
  ],
  vowel_quality: [
    { text: "There is a bug in the code.", target: "bug", confusedWith: "bag" },
    { text: "I'll call you later.", target: "call", confusedWith: "cool" },
    { text: "Give me the cup, please.", target: "cup", confusedWith: "cap" },
    { text: "I like your cat.", target: "cat", confusedWith: "cut" },
    { text: "He ran to the bus.", target: "bus", confusedWith: "boss" },
    { text: "Don't touch the hot pan.", target: "pan", confusedWith: "pen" },
    { text: "My heart hurts.", target: "heart", confusedWith: "hurt" },
    { text: "She lost her hat.", target: "hat", confusedWith: "hut" },
  ],
  th_sounds: [
    { text: "I think it's three.", target: "think", confusedWith: "sink" },
    { text: "They went there together.", target: "they", confusedWith: "day" },
    { text: "I thought about it.", target: "thought", confusedWith: "taught" },
    { text: "This is a thin book.", target: "thin", confusedWith: "tin" },
    { text: "Thank you for the bath.", target: "bath", confusedWith: "bat" },
    { text: "Is this the path?", target: "path", confusedWith: "pass" },
    { text: "I need a new thread.", target: "thread", confusedWith: "tread" },
  ],
  b_v: [
    { text: "It's a very good vest.", target: "vest", confusedWith: "best" },
    { text: "Did you vote for him?", target: "vote", confusedWith: "boat" },
    { text: "We have a new van.", target: "van", confusedWith: "ban" },
    { text: "The vet is busy today.", target: "vet", confusedWith: "bet" },
    { text: "Put it in the vase.", target: "vase", confusedWith: "base" },
    { text: "That curve is dangerous.", target: "curve", confusedWith: "curb" },
  ],
  h_j_sounds: [
    { text: "I hate it.", target: "hate", confusedWith: "eight" },
    { text: "Can you heat the water?", target: "heat", confusedWith: "eat" },
    { text: "Use your hand.", target: "hand", confusedWith: "and" },
    { text: "Is it your year?", target: "year", confusedWith: "ear" },
    { text: "Yes, you can go.", target: "yes", confusedWith: "jess" },
    { text: "Look at that yellow jacket.", target: "yellow", confusedWith: "jello" },
    { text: "He has a big house.", target: "house", confusedWith: "ounce" },
  ],
  initial_s_cluster: [
    { text: "Students study a lot in Spain.", target: "students", confusedWith: "estudents" },
    { text: "Speak slowly, please.", target: "speak", confusedWith: "espeak" },
    { text: "The street was very small.", target: "street", confusedWith: "estreet" },
    { text: "Stop the school bus.", target: "stop", confusedWith: "estop" },
    { text: "She smiled at the stars.", target: "smiled", confusedWith: "esmiled" },
    { text: "I like this style.", target: "style", confusedWith: "estyle" },
  ],
  final_consonants: [
    { text: "I worked all day yesterday.", target: "worked", confusedWith: "work" },
    { text: "She watched the game.", target: "watched", confusedWith: "watch" },
    { text: "He wanted two cats.", target: "wanted", confusedWith: "want" },
    { text: "I need a card.", target: "card", confusedWith: "car" },
    { text: "It's a nice bed.", target: "bed", confusedWith: "bet" },
    { text: "They found the gold.", target: "gold", confusedWith: "goal" },
    { text: "They played and laughed.", target: "played", confusedWith: "play" },
    { text: "I lost my keys.", target: "keys", confusedWith: "key" },
  ],
};
