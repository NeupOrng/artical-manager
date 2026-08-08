/**
 * Authored placeholder articles for local development.
 *
 * ALL OF THIS IS SYNTHETIC. No product, company, game, publisher, benchmark,
 * price, or person named here is real, and none of it has been reported. It
 * exists so the public sites can be designed and reviewed against realistic
 * long-form content — measure, leading, heading rhythm, and the excerpt/cover
 * pair that feeds Open Graph — rather than against a single lorem paragraph.
 *
 * Never let this reach a production database. `seed/index.ts` refuses to run
 * with NODE_ENV=production, which is the guard that matters.
 *
 * The gaming fixtures deliberately carry NO review score. There is no score
 * field in the model and adding one is out of scope (gaming-site/CLAUDE.md);
 * fixture data that implied one would quietly turn into a design requirement.
 */

type TipTapNode = Record<string, unknown>;

const text = (value: string, marks?: string[]): TipTapNode => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

const p = (...content: TipTapNode[]): TipTapNode => ({
  type: 'paragraph',
  content,
});

/** Plain paragraph — the overwhelmingly common case. */
const para = (value: string): TipTapNode => p(text(value));

const h = (level: 2 | 3, value: string): TipTapNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});

const quote = (value: string): TipTapNode => ({
  type: 'blockquote',
  content: [para(value)],
});

const list = (ordered: boolean, items: string[]): TipTapNode => ({
  type: ordered ? 'orderedList' : 'bulletList',
  ...(ordered ? { attrs: { start: 1 } } : {}),
  content: items.map((item) => ({
    type: 'listItem',
    content: [para(item)],
  })),
});

const rule = (): TipTapNode => ({ type: 'horizontalRule' });

const doc = (...content: TipTapNode[]): TipTapNode => ({
  type: 'doc',
  content,
});

export interface FixtureArticle {
  slug: string;
  title: string;
  status: 'published' | 'draft';
  category: string;
  excerpt?: string;
  content: TipTapNode;
  /** Days before now. Staggers the listing so date grouping is visible. */
  agedDays?: number;
}

/* ------------------------------------------------------------------ */
/* Technology                                                          */
/* ------------------------------------------------------------------ */

export const TECHNOLOGY_ARTICLES: FixtureArticle[] = [
  {
    // Slug is load-bearing: the tenant-isolation spec and the Bruno env both
    // expect this exact slug to exist in BOTH tenants. Do not rename it.
    slug: 'shared-slug-across-tenants',
    title: 'The laptop hinge is the most over-engineered part of your computer',
    status: 'published',
    category: 'reviews',
    excerpt:
      'It survives twenty thousand openings, holds a screen steady at every angle, and routes a dozen wires through a gap the width of a pencil. Nobody has ever bought a laptop because of it.',
    agedDays: 0,
    content: doc(
      para(
        'Ask someone what they care about in a laptop and they will tell you about the screen, the keyboard, the battery, and — if they have been burned before — the trackpad. Nobody says the hinge. The hinge is the part you touch more than any other component and think about less than all of them.',
      ),
      para(
        'This is a shame, because the hinge is doing something genuinely difficult. It has to hold a heavy panel motionless at any angle between roughly ninety and a hundred and thirty-five degrees, resist the wobble that comes from a tap on the screen, open with one finger without lifting the base off the desk, and do all of it about twenty thousand times before the machine is retired. It also has to be a tunnel. Display signal, camera, microphones, antennas, and sometimes power all run through it.',
      ),
      h(2, 'One finger, one hand, no lift'),
      para(
        'The single-finger opening test is the closest thing this category has to a shared benchmark, and it is not really about the hinge in isolation. It is a statement about mass distribution. For the base to stay put while the lid swings up, the base has to be heavy enough — or the hinge loose enough — that the torque never exceeds the friction holding the machine to the table.',
      ),
      para(
        'Manufacturers solve this in one of three ways, and you can usually tell which one you are holding within a second of opening it:',
      ),
      list(false, [
        'Add mass low and forward, usually battery cells, so the base simply outweighs the problem. Heavy, stable, and the reason some thin laptops are not as light as their profile suggests.',
        'Loosen the hinge and accept screen wobble. Cheap, and immediately obvious the first time you type on a train.',
        'Use a variable-torque mechanism that is loose through the first few degrees and firm after. Expensive, and the thing premium machines are quietly paying for.',
      ]),
      para(
        'The third approach is why two laptops with identical spec sheets can feel a generation apart. It never appears in a comparison table.',
      ),
      h(2, 'The tunnel problem'),
      para(
        'Every wire crossing the hinge is a wire being flexed twenty thousand times. Display cables are the fragile ones — they are wide, they are stiff, and they carry a signal fast enough that damage shows up as flicker rather than as a clean failure. The standard mitigation is to route the cable through the hinge barrel in a gentle loop with slack, so the bend radius stays large and the flex is distributed rather than concentrated at one crease.',
      ),
      para(
        'Antennas make this worse. Radio performance wants the antenna high and clear of metal, which means up in the lid, which means the antenna cable also crosses the hinge. On machines where the lid is aluminium rather than plastic, the antenna typically lives in a plastic window along the top edge — that faintly different-coloured strip you may have noticed and assumed was a design flourish.',
      ),
      quote(
        'The failure mode you should actually fear is not the hinge seizing. It is the hinge outliving its mounting points and tearing itself out of the plastic it was screwed into.',
      ),
      para(
        'That failure is common enough to be a known repair on several long-lived designs. The hinge itself is steel and effectively immortal. The boss it threads into is often a moulded plastic post, and each opening loads that post in the direction it is weakest. Machines that use a metal insert here last; machines that skip it develop a lid that no longer sits flush, then a crack at the corner of the palm rest, then a screen that arrives separately.',
      ),
      h(2, 'What to look for'),
      para(
        'None of this is on a spec sheet, so the checks have to be physical. In a shop, with the machine on a flat surface:',
      ),
      list(true, [
        'Open it with one finger from fully closed. If the base lifts, the balance is wrong.',
        'Set the screen to your normal angle and tap the top corner firmly. Count how long it takes to stop moving. Under a second is good; three seconds means you will see it every time you type.',
        'Open it to its widest angle and look along the seam where the hinge meets the base. Gaps that open up at extremes usually get worse.',
        'Press gently on the lid corners when open. Flex you can feel is flex the display cable is also feeling.',
      ]),
      rule(),
      para(
        'The reason to care is not the hinge. It is that the hinge is an honest signal. It is invisible in marketing, expensive to do properly, and impossible to fake in a photograph — which makes it one of the few parts of a laptop where cost-cutting has nowhere to hide.',
      ),
    ),
  },
  {
    slug: 'second-published-article',
    title: 'How to read a battery spec without being lied to',
    status: 'published',
    category: 'guides',
    excerpt:
      'Milliamp-hours are not a unit of battery capacity, "fast charging" is not a rate, and the quoted runtime was measured doing something you will never do. A short guide to the numbers that survive scrutiny.',
    agedDays: 2,
    content: doc(
      para(
        'Battery specifications are one of the last places in consumer technology where a number can be technically true and still useless. Nothing here is fabricated by the manufacturer. It is simply measured under conditions chosen to flatter, and quoted in units that do not compare.',
      ),
      h(2, 'Milliamp-hours are not capacity'),
      para(
        'A milliamp-hour is a measure of charge, not of energy. To get energy you have to multiply by voltage. Two batteries quoted at the same mAh can hold meaningfully different amounts of energy if they run at different voltages, which is exactly what happens when one device uses a single cell and another uses two in series.',
      ),
      para(
        'The unit that actually compares is the watt-hour: milliamp-hours times volts, divided by a thousand. Regulators require watt-hours on anything that flies, so the number is almost always printed somewhere — on the back of the device, in the manual, or on the cell itself. It is the number to use.',
      ),
      h(2, '"Fast charging" is a marketing category, not a rate'),
      para(
        'A charger advertised at a high wattage is quoting its ceiling, not its behaviour. Charge rate falls off sharply as a lithium cell fills, because pushing current into a nearly-full cell is how you damage it. The high number is real for roughly the first half of the charge and fiction for the second.',
      ),
      para(
        'This is why "0 to 50% in fifteen minutes" is the honest way to quote charging and "full in an hour" usually is not. If a manufacturer quotes the first, they are telling you something. If they only quote peak wattage, they are telling you about the power supply.',
      ),
      h(2, 'The quoted runtime was measured doing nothing'),
      para(
        'Runtime figures come from a defined test loop — commonly video playback at a fixed brightness, with radios idle and the display running at its lowest refresh rate. Video playback is close to the least demanding thing a modern device does, because the decoding runs on dedicated silicon and the rest of the machine idles.',
      ),
      para(
        'The gap between that and real use is not small. Screen brightness alone can double consumption. A high refresh rate can add a third. Anything that keeps a radio awake — a sync, a stream, a poor cellular signal — changes the picture entirely, and a weak signal is the single most expensive condition a phone can be in.',
      ),
      quote(
        'Treat the quoted runtime as a ranking, not a forecast. It is useful for comparing two devices tested the same way, and worthless as a prediction of your day.',
      ),
      h(2, 'Cycle life has an asterisk'),
      para(
        'A rating like "80% capacity after 1000 cycles" describes a cycle as a full discharge and recharge, accumulated — two half-discharges count as one. That part is fair. The asterisk is temperature. Those figures come from a climate-controlled chamber, and heat is what actually kills cells. A device charged fast, in a hot car, in a case, is not running the test that produced the number.',
      ),
      h(2, 'The four numbers worth writing down'),
      list(true, [
        'Watt-hours, not milliamp-hours. It is the only capacity figure that compares across devices.',
        'Time to 50%, not peak charger wattage. It reflects the part of the curve where fast charging is real.',
        'Rated cycles and the capacity floor together. "1000 cycles" alone means nothing without the percentage it decays to.',
        'Whether the battery is replaceable, and at what price. It is the specification that determines how long everything else matters.',
      ]),
      rule(),
      para(
        'None of these are hard to find. They are simply less prominent than the numbers designed to be compared at a glance — which is the point of putting them there.',
      ),
    ),
  },
  {
    slug: 'on-device-means-four-different-things',
    title: '"On-device" means at least four different things',
    status: 'published',
    category: 'news',
    excerpt:
      'The phrase has become a privacy claim, a latency claim, a cost claim, and a capability claim — and a product can honestly make one of them while quietly failing the other three.',
    agedDays: 5,
    content: doc(
      para(
        '"Runs on-device" has become one of those phrases that survives translation into marketing intact while losing all of its precision. It is worth separating what it can mean, because a product can satisfy one reading completely and none of the others.',
      ),
      h(2, 'The privacy claim'),
      para(
        'The strongest reading: your data never leaves the hardware you own. This is the version most people hear, and it is the one with the clearest test — put the device on a network you can inspect and watch whether anything goes out.',
      ),
      para(
        'It is also the version most easily undermined by a detail. A feature can process content locally and still send a summary, an embedding, or a telemetry event describing what it did. None of those are the original data. All of them narrow what "never leaves" means.',
      ),
      h(2, 'The latency claim'),
      para(
        'A weaker and more common reading: the round trip is short because there is no round trip. This is a real user-facing benefit and has nothing to do with privacy — a system can be entirely local for speed while still being backed by a service that sees everything else you do.',
      ),
      h(2, 'The cost claim'),
      para(
        'Local execution moves the compute bill from the vendor to your battery. This is usually invisible and occasionally not, which is why some features are quietly unavailable below a charge threshold or while a device is hot.',
      ),
      h(2, 'The capability claim'),
      para(
        'The weakest reading, and the one that most often does the work in a headline: the model is small enough to fit. A local model is generally a smaller model, and smaller is a real trade. When a product describes something as on-device without saying what it gives up, that is the omission to notice.',
      ),
      rule(),
      para(
        'The useful question is not whether something runs on-device. It is which of these four claims the vendor would be willing to put in writing.',
      ),
    ),
  },
  {
    slug: 'the-repairable-phone-is-back',
    title: 'The repairable phone is back, and the reason is boring',
    status: 'published',
    category: 'reviews',
    excerpt:
      'Screens and batteries are once again designed to come out. It is not a change of heart — it is what happens when regulation makes the repair score a number on the box.',
    agedDays: 9,
    content: doc(
      para(
        'For roughly a decade the direction of travel was one way: thinner, more sealed, more adhesive, fewer screws. That has partially reversed, and the reversal is not being driven by sentiment.',
      ),
      h(2, 'What actually changed'),
      para(
        'When a repairability score has to appear at the point of sale, it stops being a values question and becomes a specification like any other. Specifications on boxes get optimised. A pull-tab adhesive strip under the battery costs almost nothing and moves the score; a screen that can be removed without first removing the mainboard moves it more.',
      ),
      para(
        'The engineering was never the obstacle. Devices have been designed for disassembly before, in eras when service was a normal part of ownership. What disappeared was the incentive.',
      ),
      h(2, 'What has not changed'),
      list(false, [
        'Parts pricing. A phone can be trivially openable and still uneconomic to repair if the replacement display costs most of a new device.',
        'Parts availability past the third or fourth year, which is where repairability actually starts to matter.',
        'Software support windows, which set the real ceiling. A perfectly repairable device that stops receiving security updates is repairable into obsolescence.',
      ]),
      quote(
        'Repairability is three numbers — can it be opened, can the part be bought, will it still be supported. The industry has moved on the first, partially on the second, and least on the third.',
      ),
      para(
        'That ordering is not an accident. The first is a design decision, the second is a supply-chain commitment, and the third is an open-ended engineering liability. They get harder in exactly the order they matter.',
      ),
    ),
  },
  {
    slug: 'the-spreadsheet-that-runs-everything',
    title: 'Every organisation is held together by one spreadsheet nobody owns',
    status: 'published',
    category: 'guides',
    excerpt:
      'It has no tests, no backup, no documentation, and one author who left. It is also load-bearing, and replacing it with real software fails more often than it succeeds.',
    agedDays: 14,
    content: doc(
      para(
        'Somewhere in almost every organisation there is a spreadsheet that has quietly become infrastructure. It started as one person\'s working file. It now decides something that matters — a schedule, a price, a payroll input, an allocation — and it does so with no version history worth the name.',
      ),
      h(2, 'Why it wins'),
      para(
        'The spreadsheet beat the software because it could be changed by the person who understood the problem, at the moment they understood it, without a ticket. Every property that makes it terrifying is a direct consequence of the property that makes it useful.',
      ),
      h(2, 'Why replacing it usually fails'),
      para(
        'Replacement projects tend to model the spreadsheet\'s columns and miss its exceptions. The exceptions are the actual business logic. They live in a handful of cells with hardcoded overrides, in a column somebody added and never named, and in the head of the person who knows which rows to ignore.',
      ),
      list(true, [
        'Find every manual override before designing anything. They are the requirements.',
        'Ask who edits it and when. A file edited every morning is a process; a file edited every quarter is a report.',
        'Keep it running in parallel far longer than feels necessary, and compare outputs rather than trusting the migration.',
      ]),
      rule(),
      para(
        'The realistic goal is rarely deletion. It is getting the thing into version control, giving it an owner with a name, and making the overrides explicit — which removes most of the risk at a fraction of the cost of a rewrite.',
      ),
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Gaming                                                              */
/* ------------------------------------------------------------------ */

export const GAMING_ARTICLES: FixtureArticle[] = [
  {
    slug: 'shared-slug-across-tenants',
    title: 'Ashfall Delta trusts you to get lost, and that is the whole game',
    status: 'published',
    category: 'reviews',
    excerpt:
      'There is no quest marker, no compass, and no map you did not draw yourself. Forty hours in, the wetland east of the refinery is the first place in years a game has let me genuinely know.',
    agedDays: 0,
    content: doc(
      para(
        'The first thing Ashfall Delta does is take away the thing every other game in its genre gives you immediately. There is no minimap. There is no compass ribbon. There is no glowing marker at the edge of the screen indicating where the story would like you to be. There is a paper map in your inventory, and it is almost entirely blank.',
      ),
      para(
        'For about three hours this is straightforwardly unpleasant. I got lost in the reed beds south of the starting camp four separate times, twice in a circle. I want to be clear that the game does not soften this. It does not relent after an hour and hand you a marker. The reed beds stay confusing until you learn them.',
      ),
      h(2, 'Learning a place instead of following a line'),
      para(
        'And then, somewhere in the fourth hour, something happened that I have not felt in a game in a long time. I was heading back toward camp in failing light, and I recognised a broken pylon leaning over the water, and I knew — not guessed, knew — that camp was twenty minutes north-west of it. Nothing on screen told me. I had simply been there before.',
      ),
      para(
        'This is the entire design thesis, and everything else in the game exists to protect it. The world is small by contemporary standards, perhaps a fifth the size of the sprawling maps this genre usually ships. It is dense with landmarks that are genuinely distinguishable from one another. The lighting model is unusually committed to real darkness, which means night is a reason to stop moving rather than a filter over the same visibility.',
      ),
      quote(
        'A quest marker turns a world into a corridor with the walls removed. Take it away and the same geography becomes something you have to hold in your head — which is the only way it ever becomes yours.',
      ),
      h(2, 'Where it strains'),
      para(
        'The commitment is not free, and there are two places where it costs more than it earns.',
      ),
      para(
        'The first is the journal. Because the game refuses to mark your objectives, it relies on written directions from characters — go east past the refinery, look for the flooded silo. The writing is good, but the journal that records these is poorly organised, and I lost track of two side threads entirely because their instructions were three screens deep behind unrelated entries. This is a UI failure inside a design that cannot tolerate one.',
      ),
      para(
        'The second is the mid-game difficulty of one specific route. Getting into the Verge Tower district requires a traversal sequence that is not signposted, not hinted at in dialogue, and genuinely obscure. I found it by accident. Several people I have spoken to found it by looking it up, which is a real problem for a game whose entire proposition is not looking things up.',
      ),
      h(2, 'What it is not'),
      para(
        'It is not difficult in the combat sense. Encounters are sparse and mostly avoidable, and the game is clearly more interested in the walk between them than the fight itself. If the appeal of this genre for you is the fighting, this is a strange and probably frustrating purchase.',
      ),
      para(
        'It is also not a survival game, despite the setting inviting the comparison. There is no hunger meter, no crafting tree, no base to maintain. The only resource that matters is light, and the only thing you are really managing is your own memory of where things are.',
      ),
      rule(),
      para(
        'Forty hours in I can draw the eastern wetland from memory — the pylon, the two silos, the causeway that floods at high water and the long way round when it does. I could not do that for any of the much larger worlds I have spent much longer in. That is the argument, and the game makes it about as well as it could be made.',
      ),
    ),
  },
  {
    slug: 'second-published-article',
    title: 'Ashfall Delta: getting into Verge Tower, step by step',
    status: 'published',
    category: 'guides',
    excerpt:
      'The traversal route into the Verge Tower district is not signposted and not hinted at in dialogue. Here is the sequence, with the two places people get stuck, and no spoilers for what is inside.',
    agedDays: 1,
    content: doc(
      para(
        'This is the one genuinely obscure route in the game. If you are trying to avoid a walkthrough on principle, the short version is: the way in is from above, on the west side, and you need the high water. That may be enough. Everything below is the full sequence.',
      ),
      para(
        'No story spoilers follow. Nothing here describes what is inside the district or what happens when you arrive.',
      ),
      h(2, 'Before you start'),
      list(false, [
        'You need a working lamp and at least one spare cell. Two of these steps are in full darkness and there is no way to do them blind.',
        'You need high water. Check the causeway east of the refinery — if it is submerged, the tide is high enough. If you can walk it, come back later.',
        'You do not need any particular story progress. This route is open from the start, which is part of why it is so easy to miss.',
      ]),
      h(2, 'The route'),
      list(true, [
        'From the refinery, follow the western drainage channel north until it forks. Take the left fork — the right one dead-ends at a collapsed grate that looks deliberate and is not.',
        'At the end of the left fork there is a maintenance ladder behind a stack of pallets. The pallets are movable. This is the first place people get stuck, because from the approach the ladder is entirely hidden and there is no prompt until the pallets are clear.',
        'Climb to the gantry and follow it east. It is unlit for a long stretch. Keep the railing on your right and do not try to cross the gap where the gantry is broken — there is a way down before it.',
        'Take the stairs down at the break, then immediately back up the parallel run. This looks like backtracking and is not; it puts you on the upper gantry, which continues past the break.',
        'Follow the upper gantry to the water tower. From the tower platform, at high water only, you can drop onto the roof of the pump house. At low water the drop is fatal, which is the second place people get stuck and the reason the tide matters.',
        'From the pump house roof, walk east. The district entrance is the open service door, not the large shuttered one beside it.',
      ]),
      quote(
        'If you are standing on the water tower platform and the drop looks too far, it is. Come back at high water. The game does not tell you this and will happily let you find out the other way.',
      ),
      h(2, 'If you have already got in another way'),
      para(
        'There is a second entrance that opens later. It is considerably easier and it is the one most players eventually find. If you have it, you do not need any of the above — the routes converge immediately inside.',
      ),
      rule(),
      para(
        'Written against the current build. If a patch changes the pump house drop, the tide requirement is the part most likely to move.',
      ),
    ),
  },
  {
    slug: 'patch-notes-as-a-literary-form',
    title: 'Patch notes have quietly become a literary form',
    status: 'published',
    category: 'news',
    excerpt:
      'Somewhere between the changelog and the apology, studios started writing for an audience that reads every line. The results are stranger and better than they have any commercial reason to be.',
    agedDays: 4,
    content: doc(
      para(
        'Patch notes began as a maintenance artifact — a list of what changed, written for people who needed to know whether to reinstall. They were not written to be read for pleasure and generally were not.',
      ),
      para(
        'That is no longer reliably true. A meaningful number of studios now write notes that assume an audience which reads every line, remembers the last set, and will notice an inconsistency between them.',
      ),
      h(2, 'What changed'),
      para(
        'Games stopped shipping and started running. When a game is a place people return to weekly for years, the patch note becomes the only regular direct communication between the people who make it and the people who live in it. That is a relationship, and relationships develop a voice.',
      ),
      list(false, [
        'The confession — a bug explained in enough technical detail that you understand why it took three weeks. This buys more goodwill than any apology.',
        'The joke buried in a low-priority fix, which functions as a signature: someone specific wrote this.',
        'The refusal — a change players asked for, declined, with reasoning. Rarer, riskier, and the strongest signal a studio can send that it has a design position.',
      ]),
      quote(
        'The tell of a healthy patch note is that it explains a decision you disagree with well enough that you understand it anyway.',
      ),
      h(2, 'The failure mode'),
      para(
        'The form has a predictable way of going wrong: personality applied to notes that contain no substance. A changelog of "various bug fixes and improvements" does not become better by being written in a funny voice. It becomes worse, because the voice now reads as a distraction from the absence of detail.',
      ),
    ),
  },
  {
    slug: 'the-handheld-that-refuses-to-die',
    title: 'The handheld that refuses to die',
    status: 'published',
    category: 'reviews',
    excerpt:
      'Eight years old, two hardware revisions behind, and still the console most people in this office actually pick up. What it got right is almost entirely unglamorous.',
    agedDays: 7,
    content: doc(
      para(
        'On paper this machine has been obsolete for years. It is slower than everything current, its screen is a generation behind, and its battery is worse than any competitor still on sale. It also gets picked up more than any of them.',
      ),
      h(2, 'The unglamorous list'),
      list(false, [
        'It wakes instantly. Not quickly — instantly, from any state, every time. Nothing else in the category has matched this consistently.',
        'It is the right weight. Heavy enough not to feel disposable, light enough to hold above your face without your wrists complaining.',
        'The buttons have not degraded. Eight years of use and the shoulder buttons still have their full travel, which is not true of any newer unit here.',
        'It charges from the same connector as everything else you own, which sounds trivial and is the reason it lives in a bag rather than a drawer.',
      ]),
      para(
        'None of these are features you can put on a box, and all of them are decisions that cost money at manufacture and pay back only over years.',
      ),
      h(2, 'What it gets wrong'),
      para(
        'The screen is genuinely bad in daylight, the storage is not practically expandable any more now that the format it uses has become expensive, and the online service it depends on will presumably be switched off at some point, taking a portion of the library with it. That last one is the real expiry date, and it has nothing to do with the hardware.',
      ),
      rule(),
      para(
        'The lesson is not that old hardware is good. It is that responsiveness, weight, and button feel are the properties that survive a decade, and they are consistently the first things traded away for a specification that reviews better.',
      ),
    ),
  },
  {
    slug: 'the-quiet-death-of-the-loading-screen',
    title: 'The quiet death of the loading screen took something with it',
    status: 'published',
    category: 'esports',
    excerpt:
      'Fast storage removed a universally hated thing. It also removed the only reliable pause in a session, and a surprising amount of design was leaning on it.',
    agedDays: 11,
    content: doc(
      para(
        'Nobody is going to argue for the loading screen. It was dead time, it was the single most complained-about property of the previous hardware generation, and its removal is an unambiguous technical achievement.',
      ),
      para(
        'It was also, accidentally, doing several jobs.',
      ),
      h(2, 'What it was carrying'),
      list(false, [
        'A tutorial surface. The loading-screen tip is a much-mocked format that nevertheless taught mechanics at the exact moment a player was idle and receptive.',
        'A pacing beat. The gap between dying and retrying set the emotional rhythm of difficult games. Removing it makes failure cheaper, which changes how a challenge feels in ways designers are still calibrating.',
        'A natural stopping point. Sessions used to end at a load. Without one, the seam where you would have put the controller down does not exist.',
      ]),
      quote(
        'Instant retry is strictly better as a feature and strictly different as an experience. Those are not the same claim, and the second one took a while to notice.',
      ),
      h(2, 'What replaced it'),
      para(
        'Mostly nothing, which is the interesting part. The tips moved to menus nobody opens. The pacing beat has been partially reconstructed with deliberate animation — a slow stand-up, a held fade — which is a loading screen re-added by hand, costing the thing that was just removed.',
      ),
      para(
        'The stopping point has not been replaced at all, and that is the one with consequences outside the game.',
      ),
    ),
  },
];
