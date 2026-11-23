// Marking. The model only classifies what the child said; the marks are then worked out
// by fixed rules below, so every child is marked the same way and every mark can be explained.
import { askJSON } from './ai.js';
import { SAMPLE_TARGETS } from './samples.js';

// A whole speaking section given as one block (the sample calls) is marked as a single card.
export function effective(section, clips) {
  if (section.kind !== 'speak' || !clips[section.id]) return section;
  return { ...section, cards: [{ id: section.id, marks: section.marks, target: SAMPLE_TARGETS[section.id] || 10, say: section.cards.map((c) => c.say).join(' ') }] };
}

export const WEIGHT = { ok: 1, err: 0.55, unclear: 0, wrong: 0 }; // Masi: full mark if correct, 50-60% if the message gets across, 0 if not understood
export const ERROR_TYPES = {
  third_person: '3rd person verbs (she go, he like)',
  be_missing: 'present continuous, missing is/are (she wearing)',
  like_verb: 'like / love + verb (I like eat)',
  article: 'articles a / an / the',
  preposition: 'prepositions',
  possessive: "possessive 's (my mother name)",
  plural: 'singular / plural',
  tense: 'tense',
  question_form: 'forming questions',
  word_order: 'word order',
  am_pm: 'am / pm',
  vocabulary: 'wrong word',
  other: 'other',
};

const COMMON = `You are marking a spoken English test for children (about 10 to 14 years old) in India whose home language is Hindi. You receive word-for-word speech-to-text transcripts of the CHILD ONLY. The transcript keeps the child's mistakes; never correct them in your output.

How to read the transcript
- Split what the child said into sentences. A sentence is one complete idea with a subject and a verb. Join false starts and stammers into the sentence they belong to.
- If the child corrects themself ("My mother name is... My mother's name is..."), count it ONCE and judge the final version.
- If the child says the same sentence again, count it once.
- Ignore fillers (um, uh, okay, yes ma'am) and anything that just reads the question back.
- Hindi does not count. Anything in Hindi (Devanagari or Hindi words in Roman letters, beyond a single name or food word) gets verdict "hindi".
- Single words, lists and phrases with no verb ("Talking.", "In the mobile.", "Library and kitchen.") get verdict "frag".
- Indian English is correct English: "class seven", "ma'am", "brinjal", "muffler", "pant", "giving exam", names of people and places. Do not penalise accent or the speech-to-text spelling of names.

Verdict for each sentence
- "ok": grammatically correct. Articles, prepositions, verb forms, plurals and possessives are all right.
- "err": has one or more grammar or word mistakes, but the meaning is clear.
- "unclear": you cannot tell what the child means.
- "wrong": clear English, but it does not answer the question, or it is untrue about the picture or map.
- "frag" and "hindi" as described above.
Be strict and consistent: "She like to play" and "My mother name is" are "err" every time.

For every "err" sentence give "tags": one or more of ${Object.keys(ERROR_TYPES).join(', ')}; and "fix": the corrected sentence.
Set "doubt": true only when the speech-to-text itself looks unreliable for that sentence (garbled words, or a word that sounds like the right one but is written differently).

Reply with JSON only, no other text.`;

function speakPrompt(section, clips) {
  const cards = section.cards.map((c) => ({
    id: c.id, question: c.say, must_be_questions: !!c.questions,
    transcript: clips[c.id]?.text ?? null,
  }));
  return `${section.facts ? 'FACTS TO CHECK AGAINST\n' + section.facts + '\n\n' : ''}SECTION: ${section.title}
${section.cards.some((c) => c.questions) ? 'For a card with must_be_questions, only questions the child asks about the school count. Statements there are "wrong". A question with wrong word order ("There is a library in your school?") is "err" with tag question_form.\n' : ''}
CARDS
${JSON.stringify(cards, null, 1)}

Return: {"cards":[{"id":"...","sentences":[{"t":"exact words the child said","v":"ok|err|unclear|wrong|frag|hindi","tags":[],"fix":"","doubt":false}]}]}
A card with transcript null or empty gets "sentences": [].`;
}

function blanksPrompt(section, clips) {
  const items = section.items.map((it) => ({
    id: it.id, sentence: it.text, accepted_answers_per_blank: it.answers, note: it.note || undefined,
    transcript: clips[it.id]?.text ?? null,
  }));
  return `SECTION: ${section.title}
The child saw each sentence with blanks (___) and said the whole sentence aloud with the missing words. For each blank, work out which word(s) the child said in that position.
- "ok": true if the child's word is one of the accepted answers, or is another word that is grammatically correct AND sensible in that sentence (then set "offkey": true so a teacher can see it was not in the answer key).
- A wrong verb form is wrong ("My mother have", "She cook", "They are read", "I am wear", "likes to cooks").
- If the child skipped the blank or did not say the sentence, "said" is "" and "ok" is false.
- "doubt": true when the speech-to-text word is not an accepted answer but sounds almost the same as one (for example "won't" for "wants"), or the transcript is garbled. A teacher will listen to these.

ITEMS
${JSON.stringify(items, null, 1)}

Return: {"items":[{"id":"...","blanks":[{"said":"...","ok":true,"offkey":false,"doubt":false}]}]}
Each item must have exactly as many blanks as its accepted_answers_per_blank.`;
}

const half = (n) => Math.round(n * 2) / 2;

export function scoreSpeak(section, result) {
  const cards = section.cards.map((c) => {
    const r = result.cards?.find((x) => x.id === c.id);
    const sentences = (r?.sentences || []).filter((s) => s && s.t && WEIGHT[s.v] !== undefined || ['frag', 'hindi'].includes(s?.v));
    const n = { ok: 0, err: 0, unclear: 0, wrong: 0, frag: 0, hindi: 0 };
    for (const s of sentences) n[s.v] = (n[s.v] || 0) + 1;
    const counted = n.ok + n.err + n.unclear + n.wrong;
    const points = n.ok * WEIGHT.ok + n.err * WEIGHT.err;
    const raw = c.marks * (points / Math.max(counted, c.target));
    return { id: c.id, marks: c.marks, target: c.target, sentences, n, counted, raw };
  });
  const score = Math.min(section.marks, half(cards.reduce((a, c) => a + c.raw, 0)));
  return { kind: 'speak', score, max: section.marks, cards };
}

export function scoreBlanks(section, result) {
  let score = 0;
  const items = section.items.map((it) => {
    const r = result.items?.find((x) => x.id === it.id);
    const blanks = it.answers.map((accepted, i) => {
      const b = r?.blanks?.[i] || { said: '', ok: false };
      if (b.ok) score += 1;
      return { said: b.said || '', ok: !!b.ok, offkey: !!b.offkey, doubt: !!b.doubt, accepted };
    });
    return { id: it.id, text: it.text, blanks };
  });
  return { kind: 'blanks', score, max: section.marks, items };
}

export async function markSection(section, clips) {
  section = effective(section, clips);
  const has = (section.cards || section.items).some((c) => clips[c.id]?.text);
  if (!has) {
    return section.kind === 'speak'
      ? scoreSpeak(section, { cards: [] })
      : scoreBlanks(section, { items: [] });
  }
  if (section.kind === 'speak') return scoreSpeak(section, await askJSON(COMMON, speakPrompt(section, clips)));
  return scoreBlanks(section, await askJSON(COMMON, blanksPrompt(section, clips), 3000));
}

// Tallies used in the comment column and the teacher screen.
export function tally(assessment, marks) {
  const t = { sentences: 0, ok: 0, err: 0, unclear: 0, wrong: 0, hindi: 0, frag: 0, tags: {}, examples: {} };
  for (const s of assessment.sections) {
    const m = marks[s.id];
    if (!m || m.kind !== 'speak') continue;
    for (const c of m.cards) {
      for (const k of ['ok', 'err', 'unclear', 'wrong', 'hindi', 'frag']) t[k] += c.n[k] || 0;
      t.sentences += c.counted;
      for (const sn of c.sentences) for (const tag of sn.tags || []) {
        if (sn.v !== 'err') continue;
        t.tags[tag] = (t.tags[tag] || 0) + 1;
        (t.examples[tag] ||= []).length < 3 && t.examples[tag].push(sn.t);
      }
    }
  }
  return t;
}

export async function writeComment(assessment, marks, name) {
  const t = tally(assessment, marks);
  const sections = assessment.sections.map((s) => {
    const m = marks[s.id]; if (!m) return null;
    if (m.kind === 'speak') return { section: s.title, score: m.score, out_of: m.max, sentences: m.cards.flatMap((c) => c.sentences.map((x) => ({ said: x.t, verdict: x.v, tags: x.tags }))) };
    return { section: s.title, score: m.score, out_of: m.max, wrong_blanks: m.items.flatMap((i) => i.blanks.filter((b) => !b.ok).map((b) => ({ sentence: i.text, child_said: b.said, accepted: b.accepted }))) };
  }).filter(Boolean);
  const sys = `You write the teacher's comment for a child's spoken English test, in the style of an experienced, warm, plain-speaking trainer writing notes for another teacher. Use only what is in the data. Quote the child's actual mistakes as short examples. No scores in the comment. Reply with JSON only.`;
  const user = `Child: ${name}
Tally of spoken sentences: ${JSON.stringify({ total: t.sentences, correct: t.ok, with_errors_but_understood: t.err, not_understood: t.unclear, off_topic_or_untrue: t.wrong })}
Most frequent error types: ${JSON.stringify(t.tags)}
${JSON.stringify(sections)}

Return {"comment":"3 to 5 short sentences. Start with what the child does well (confidence, how much they can say, which sections were strong). Then the areas to work on, each with one or two quoted examples, like: 3rd person verbs: She cook, He like play cricket.","revise":["up to 3 short, specific things to practise next, e.g. Present continuous with is/are"]}`;
  const r = await askJSON(sys, user, 900);
  return { comment: String(r.comment || '').trim(), revise: Array.isArray(r.revise) ? r.revise.slice(0, 3).map(String) : [] };
}
