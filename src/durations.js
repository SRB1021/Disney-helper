// Approximate ride lengths in minutes (from public ride info; ThemeParks.wiki doesn't provide them).
// First matching pattern wins. Unknown rides fall back to DEFAULT_MIN.
const DEFAULT_MIN = 5;

const TABLE = [
  // Magic Kingdom
  [/seven dwarfs/, 3], [/space mountain/, 3], [/big thunder/, 4], [/tiana|splash mountain/, 11],
  [/haunted mansion/, 9], [/pirates of the caribbean/, 9], [/jungle cruise|jingle cruise/, 10],
  [/peter pan/, 3], [/small world/, 11], [/dumbo/, 2], [/mad tea/, 2], [/barnstormer/, 1],
  [/winnie the pooh/, 4], [/under the sea|little mermaid/, 6], [/buzz lightyear/, 5], [/astro orbiter/, 2],
  [/carousel of progress/, 22], [/peoplemover/, 10], [/country bear/, 16], [/magic carpets/, 2],
  [/regal carrousel/, 2], [/tron/, 2], [/tiki room/, 15], [/hall of presidents/, 25], [/riverboat/, 17],
  [/railroad/, 20], [/laugh floor/, 15], [/treehouse/, 15], [/philharmagic/, 12], [/tom sawyer/, 10],
  [/many adventures/, 4],
  // Hollywood Studios
  [/rise of the resistance/, 18], [/slinky dog/, 3], [/runaway railway/, 9], [/tower of terror/, 5],
  [/rock .?n.? roller/, 3], [/smugglers run/, 5], [/toy story mania/, 7], [/star tours/, 5],
  [/swirling saucers/, 2], [/muppet/, 17], [/frozen sing/, 30], [/beauty and the beast/, 30],
  // EPCOT
  [/cosmic rewind/, 4], [/test track/, 5], [/frozen ever after/, 5], [/ratatouille/, 5], [/soarin/, 5],
  [/spaceship earth/, 15], [/mission: ?space/, 5], [/living with the land/, 14], [/gran fiesta/, 9],
  [/imagination/, 7], [/seas with nemo/, 5], [/turtle talk/, 14], [/journey of water/, 15],
  [/canada far and wide|reflections of china|american adventure/, 18],
  // Animal Kingdom
  [/flight of passage/, 6], [/na.?vi river/, 5], [/expedition everest/, 4], [/kilimanjaro/, 20],
  [/dinosaur/, 4], [/kali river/, 5], [/triceratop/, 2], [/lion king/, 30], [/finding nemo/, 40],
  [/wildlife express/, 8], [/gorilla falls/, 30], [/maharajah/, 30], [/primeval whirl/, 2],
  // Water parks
  [/slide|slalom|rapids|flyer|run$|raft|tornado|plunge|summit|surf|wave|river|creek/, 3],
];

function rideDuration(name) {
  const n = String(name || '').toLowerCase().replace(/[’‘]/g, "'");
  const hit = TABLE.find(([re]) => re.test(n));
  return hit ? hit[1] : DEFAULT_MIN;
}

// The table's value, or null when the ride isn't in the table (so callers can tell a guess from a default).
function knownDuration(name) {
  const n = String(name || '').toLowerCase().replace(/[’‘]/g, "'");
  const hit = TABLE.find(([re]) => re.test(n));
  return hit ? hit[1] : null;
}

module.exports = { rideDuration, knownDuration, DEFAULT_MIN };
