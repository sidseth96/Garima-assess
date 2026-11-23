// Assessment definitions. Add another object to ASSESSMENTS to host a new test.
// Server-only: holds answer keys and picture facts. publicView() strips them for the child's phone.

const PARK_FACTS = `PICTURE 1 (a garden in front of a house, sunny but cold winter day; everyone wears jackets, woollen caps and scarves/mufflers):
- Kapil: sitting on the grass, reading a (picture) book. Red cap, blue jacket, scarf.
- Anu: sitting on a bench, knitting (a red sweater / with red wool). Pink cap, purple jacket, red scarf, blue jeans, brown boots. A basket of wool is next to her.
- Atul: sitting on a bench, talking on his (mobile) phone and holding a cup (tea/coffee). Black cap, green jacket, checked scarf.
- Mina (Meena): skipping / jumping rope. Pink jacket, pink cap, scarf.
- Arun: standing / hiding behind the tree. Blue cap.
- Mrs Gupta: standing in front of the house (at the door), waving. Purple cardigan, pink scarf, glasses, grey hair.
- Raju: riding a (blue) bicycle / cycling, wearing a helmet. Blue jacket.
- Rina (Reena): playing basketball / throwing the ball at the hoop. Pink cap, purple jacket.
- Seema: sitting in the red car (she may be described as driving or waving).
- Anil: running. Orange jacket, blue cap, green scarf, gloves.
- A baby is sleeping in a pram / stroller next to Anu's bench.
- The plane is flying in the sky, above the house / the car / the trees.
- The (green) parrot is on the tree / on a branch, above Arun.
- The yellow bird is on (top of) the car.
- The water bottle is on the table, next to the flower pot.
- The dog is under the table (lying down / sleeping).
- The cat is on the grass, next to the ball (football).
- The ball is between the cat and the box. The box is on the grass, next to the ball.
- It is not raining. The sun is shining. It is cold, which is why people wear jackets, caps, gloves and mufflers.`;

const MAP_FACTS = `PICTURE 2 (a street map). The child stands at "You are here" at the bottom, looking up a straight main road.
- First crossing: DV Road goes left, AB Road goes right. Second crossing (with the traffic light): MG Road goes left, Mira Road goes right.
- Far side of MG Road (top left), from far left to the main road: Shoe Shop, Book Shop, Toy Shop. The Book Shop is between the Shoe Shop and the Toy Shop.
- Far side of Mira Road (top right), from the main road outwards: Hospital, Hotel Raj, Supermarket. Hotel Raj is between the Hospital and the Supermarket.
- Block between MG Road and DV Road (middle left), from far left to the main road: Cinema, Library, Bank. The Library is between the Cinema and the Bank.
- Block between Mira Road and AB Road (middle right), from the main road outwards: ABC School, Playground, Sandwiches (sandwich shop). The Playground is between ABC School and the sandwich shop.
- Near side of DV Road (bottom left), from far left to the main road: Coffee Shop, Metro Station, Police Station. The Metro Station is between them.
- Near side of AB Road (bottom right): Fire Station next to the main road, then two buildings with no name.
- Opposites across a road: Cinema–Coffee Shop, Library–Metro Station, Bank–Police Station, ABC School–Fire Station, Shoe Shop–Cinema, Book Shop–Library, Toy Shop–Bank, Hospital–ABC School, Hotel Raj–Playground, Supermarket–Sandwiches.
- Directions: to reach anything on DV Road or AB Road, go straight and take the FIRST left / right. For MG Road or Mira Road, go straight and take the SECOND left / right, at the traffic light. Example: for Hotel Raj, go straight, take the second right at the traffic light; it is on Mira Road, the second building on the left, between the hospital and the supermarket, opposite the playground.
- Be lenient about which of the two neighbouring roads a middle-block building is "on". Be strict about first/second turn, left/right, between, next to and opposite.`;

const blank = (id, text, answers, note) => ({ id, text, answers, note });

export const ASSESSMENTS = {
  ttm: {
    id: 'ttm',
    title: 'Speaking test',
    subtitle: 'TTM pilot',
    minutes: 40,
    total: 100,
    voice: 'MgeyPVSfQalNTyBkQqyd', // ElevenLabs "Garima"
    greeting: 'Hello! I am Garima Didi. We will now start our test. I will ask you a question. Then you press the red button and answer in English. Take your time.',
    greetingHi: 'नमस्ते! मैं गरिमा दीदी हूँ। अब हम टेस्ट शुरू करेंगे। मैं सवाल पूछूँगी, फिर आप लाल बटन दबाकर अंग्रेज़ी में जवाब दीजिए। आराम से बोलिए।',
    sections: [
      {
        id: 'self', title: 'About you', column: 'Intro - Self', marks: 10, kind: 'speak', listenOnly: true,
        intro: 'First, tell me about yourself.',
        cards: [
          { id: 'a1', marks: 2.5, target: 5, say: 'Tell me about yourself. What is your name? How old are you? Which class are you in, and where do you live?', hi: 'अपने बारे में बताइए। आपका नाम, उम्र, कक्षा, और आप कहाँ रहते हैं।' },
          { id: 'a2', marks: 2.5, target: 5, say: 'Tell me about your favourite things. What do you like? And what do you not like?', hi: 'अपनी पसंदीदा चीज़ों के बारे में बताइए। आपको क्या पसंद है और क्या पसंद नहीं है?' },
          { id: 'a3', marks: 2.5, target: 5, say: 'Tell me about your day. What do you do in the morning? What do you do after school? And what do you do in the evening?', hi: 'अपनी दिनचर्या बताइए। सुबह, स्कूल के बाद और शाम को आप क्या करते हैं?' },
          { id: 'a4', marks: 2.5, target: 5, say: 'What do you do on Sundays?', hi: 'रविवार को आप क्या करते हैं?' },
        ],
      },
      {
        id: 'school', title: 'Your school', column: 'My School', marks: 10, kind: 'speak', listenOnly: true,
        intro: 'Now let us talk about your school.',
        cards: [
          { id: 'b1', marks: 4, target: 6, say: 'Say all you can about your school.', hi: 'अपने स्कूल के बारे में जितना बता सकते हैं, बताइए।' },
          { id: 'b2', marks: 3, target: 4, say: 'Tell me about your class and the rooms in your school. Which floor is your classroom on? What other rooms are there?', hi: 'अपनी कक्षा और स्कूल के कमरों के बारे में बताइए। आपकी कक्षा किस मंज़िल पर है? और कौन-कौन से कमरे हैं?' },
          { id: 'b3', marks: 3, target: 5, questions: true, say: 'I am a student. I go to school too. Now you ask me five questions about my school.', hi: 'मैं भी एक छात्रा हूँ। अब आप मुझसे मेरे स्कूल के बारे में पाँच सवाल पूछिए।' },
        ],
      },
      {
        id: 'family', title: 'Your family', column: 'My Family', marks: 10, kind: 'speak', listenOnly: true,
        intro: 'Next, your family.',
        cards: [
          { id: 'c1', marks: 2, target: 4, say: 'How many people are there in your family? Introduce them.', hi: 'आपके परिवार में कितने लोग हैं? उनका परिचय दीजिए।' },
          { id: 'c2', marks: 3, target: 5, say: 'Tell me about the daily routine of your mother, your father, or your brother or sister. What do they do from morning to night?', hi: 'अपनी माँ, पिता, भाई या बहन की दिनचर्या बताइए। वे सुबह से रात तक क्या करते हैं?' },
          { id: 'c3', marks: 1.5, target: 3, say: 'What do they do on the weekends?', hi: 'वे शनिवार और रविवार को क्या करते हैं?' },
          { id: 'c4', marks: 2, target: 4, say: 'What do they like? And what do they not like?', hi: 'उन्हें क्या पसंद है? और क्या पसंद नहीं है?' },
          { id: 'c5', marks: 1.5, target: 2, say: 'When are their birthdays?', hi: 'उनके जन्मदिन कब हैं?' },
        ],
      },
      {
        id: 'picture', title: 'Describe the picture', column: 'Describe what everyone is doing and where everything is', marks: 20, kind: 'speak',
        image: '/img/park.jpg', facts: PARK_FACTS,
        intro: 'Now look at a picture. There are lots of people in it, and they all have a name.',
        cards: [
          { id: 'd1', marks: 10, target: 10, say: 'Look at the picture. Tell me what everyone is doing. Let us start with Kapil.', hi: 'तस्वीर देखिए। बताइए हर कोई क्या कर रहा है। कपिल से शुरू कीजिए।', chips: ['Kapil', 'Anu', 'Atul', 'Mina', 'Arun', 'Mrs Gupta', 'Raju', 'Rina', 'Seema', 'Anil'] },
          { id: 'd2', marks: 5, target: 5, say: 'Now talk about the weather. What is everyone wearing? Why are they wearing jackets and mufflers?', hi: 'अब मौसम के बारे में बताइए। सबने क्या पहना है? उन्होंने जैकेट और मफ़लर क्यों पहने हैं?' },
          { id: 'd3', marks: 5, target: 5, say: 'Now say where everything is. The plane, the parrot, the yellow bird, the water bottle, the dog, the cat, the box and the ball.', hi: 'अब बताइए कौन सी चीज़ कहाँ है।', chips: ['plane', 'parrot', 'yellow bird', 'water bottle', 'dog', 'cat', 'box', 'ball'] },
        ],
      },
      {
        id: 'map', title: 'The neighbourhood', column: 'Neighbourhood pic', marks: 10, kind: 'speak',
        image: '/img/map.jpg', facts: MAP_FACTS,
        intro: 'Here is a map of a neighbourhood.',
        cards: [
          { id: 'e1', marks: 6, target: 6, say: 'Look at the map. Where exactly are the buildings? Let us start with the bookshop. Then tell me about five more buildings.', hi: 'नक्शा देखिए। इमारतें ठीक कहाँ हैं? बुकशॉप से शुरू कीजिए, फिर पाँच और इमारतों के बारे में बताइए।', chips: ['on … Road', 'next to', 'between', 'opposite'] },
          { id: 'e2', marks: 4, target: 4, say: 'You are standing at the red arrow. Tell me the way to Hotel Raj. Then tell me the way to the library.', hi: 'आप लाल तीर पर खड़े हैं। होटल राज का रास्ता बताइए। फिर लाइब्रेरी का रास्ता बताइए।', chips: ['go straight', 'turn left', 'turn right', 'first', 'second'] },
        ],
      },
      {
        id: 'blanks', title: 'Fill in the blanks', column: 'Fill in the blanks', marks: 32, kind: 'blanks',
        intro: 'Now you will see sentences with a missing word. Say the whole sentence with the right word.',
        say: 'Say the whole sentence with the missing word.',
        hi: 'खाली जगह भरकर पूरा वाक्य बोलिए।',
        items: [
          blank('f1', 'I like ___ cricket on Sundays.', [['playing', 'watching']]),
          blank('f2', 'My father ___ tea every day.', [['drinks', 'makes', 'likes to drink', 'has']]),
          blank('f3', 'My mother ___ long, black hair.', [['has']]),
          blank('f4', 'My birthday is ___ the 3rd ___ July.', [['on'], ['of']]),
          blank('f5', 'The bank is ___ the library and the toy shop.', [['between', 'next to', 'after', 'before']]),
          blank('f6', 'Woollen socks keep my ___ warm.', [['feet']]),
          blank('f7', 'Your shoes are ___ the bed.', [['under', 'next to', 'beside', 'near']]),
          blank('f8', 'My mother ___ up ___ 7 am. She ___ breakfast for me. Then, she ___ the house. Then, she ___ for a walk.', [['wakes', 'gets'], ['at'], ['makes', 'cooks', 'prepares'], ['cleans'], ['goes']]),
          blank('f9', 'The plane is flying ___ the house.', [['above', 'over']]),
          blank('f10', 'The children are ___ on a bench. They are ___ their books.', [['sitting'], ['reading']]),
          blank('f11', 'Meera is slim. She is ___ plump.', [['not']]),
          blank('f12', 'It is very ___ today. I am ___ a muffler ___ gloves.', [['cold'], ['wearing'], ['and']]),
          blank('f13', 'The children ___ like studying.', [["don't", 'do not']], 'The answer must be the negative.'),
          blank('f14', 'On Sundays, Mira ___ her teeth and ___ her face, then, ___ ___ a bath. After that, she ___ to the playground. She ___ her homework in the evening, and ___ TV at night.', [['brushes'], ['washes'], ['she'], ['has', 'takes'], ['goes'], ['does'], ['watches']]),
          blank('f15', 'Reena ___ Hindi and English in school.', [['teaches', 'studies', 'learns']]),
          blank('f16', 'Meena ___ like ___ milk. She ___ eating oranges.', [["doesn't", 'does not'], ['drinking'], ['likes', "doesn't like", 'is', 'loves']], 'The first blank must be the negative.'),
        ],
      },
      {
        id: 'choose', title: 'Choose the right word', column: 'Choose the right answer', marks: 8, kind: 'blanks',
        intro: 'Last part. Choose the right word and say the whole sentence.',
        say: 'Choose the right word. Say the whole sentence.',
        hi: 'सही शब्द चुनकर पूरा वाक्य बोलिए।',
        items: [
          blank('g1', 'I ___ like eating grapes.', [["don't"]], null),
          blank('g2', 'My mother ___ have long hair.', [["doesn't"]]),
          blank('g3', 'Rina ___ the clothes in the garden.', [['dries']], 'Both options sound the same, so the child must also SPELL the word. Correct spelling is D-R-I-E-S. If the child does not spell it, or spells D-R-Y-S, the blank is wrong.'),
          blank('g4', 'Atul ___ his homework at 4 pm.', [['finishes']]),
          blank('g5', 'Rahul likes to ___. He ___ every day. He ___ to become a chef.', [['cook'], ['cooks'], ['wants']]),
          blank('g6', '___ Rina go to the park in the evening?', [['Does']]),
        ],
        options: { g1: [["don't", "doesn't"]], g2: [["don't", "doesn't"]], g3: [['drys', 'dries']], g4: [['finishes', 'finish']], g5: [['cook', 'cooks'], ['cook', 'cooks'], ['wants', 'want']], g6: [['Do', 'Does']] },
        extra: { g3: 'After the sentence, spell the word you chose.' },
      },
    ],
  },
};

export function getAssessment(id) { return ASSESSMENTS[id] || null; }

// Every recordable unit in order: { id, section, kind, marks, target }
export function units(a) {
  const out = [];
  for (const s of a.sections) {
    for (const c of s.cards || s.items) out.push({ ...c, section: s.id, kind: s.kind });
  }
  return out;
}

// Every line Garima Didi speaks, keyed for the audio cache.
export function spokenLines(a) {
  const lines = { greeting: a.greeting };
  for (const s of a.sections) {
    lines['intro-' + s.id] = s.intro;
    if (s.kind === 'blanks') lines['say-' + s.id] = s.say;
    for (const c of s.cards || []) lines[c.id] = c.say;
  }
  lines.done = 'Shabash! You have finished the test. Well done.';
  return lines;
}

// What the child's phone is allowed to see: no answers, no picture facts.
export function publicView(a) {
  return {
    id: a.id, title: a.title, subtitle: a.subtitle, minutes: a.minutes, total: a.total,
    greeting: a.greeting, greetingHi: a.greetingHi,
    sections: a.sections.map((s) => ({
      id: s.id, title: s.title, marks: s.marks, kind: s.kind, listenOnly: !!s.listenOnly,
      image: s.image || null, intro: s.intro, say: s.say || null, hi: s.hi || null,
      cards: (s.cards || s.items).map((c) => ({
        id: c.id, say: c.say || null, hi: c.hi || null, chips: c.chips || null, target: c.target || null,
        text: c.text || null, options: (s.options && s.options[c.id]) || null, extra: (s.extra && s.extra[c.id]) || null,
      })),
    })),
  };
}
